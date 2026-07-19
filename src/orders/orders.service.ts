import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { DeliveryQueueService } from '../deliverers/delivery-queue.service';
import { KdsService } from '../kds/kds.service';
import { OrdersGateway } from './orders.gateway';
import { StockGateway } from '../estoque/stock.gateway';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateOrderItemsDto } from './dto/update-order-items.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import {
  DiscountType,
  FlavorPriceRule,
  OrderStatus,
  OrderType,
  PizzeriaUserRole,
  Prisma,
  type Crust,
} from '@prisma/client';

export type { JwtPayload } from '../modules/auth/auth.service';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface FlavorData {
  productId: string;
  name: string;
  price: number;
}

interface ResolvedItem {
  productId: string;
  productSizeId?: string;
  crustId?: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  flavors: FlavorData[] | null;
  notes?: string;
}

// RN02 — businessHours JSON shape:
// { "0": { "open": false }, "1": { "open": true, "from": "18:00", "to": "23:30" }, ... }
// Keys "0"–"6" where 0 = Sunday, following Date.getDay()
interface DaySchedule {
  open: boolean;
  from?: string; // "HH:MM"
  to?: string;   // "HH:MM"
}

// ---------------------------------------------------------------------------
// Allowed status transitions
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.new]: [OrderStatus.accepted, OrderStatus.cancelled],
  [OrderStatus.accepted]: [OrderStatus.preparing, OrderStatus.cancelled],
  [OrderStatus.preparing]: [OrderStatus.ready, OrderStatus.cancelled],
  [OrderStatus.ready]: [OrderStatus.delivering, OrderStatus.done, OrderStatus.cancelled],
  [OrderStatus.delivering]: [OrderStatus.done, OrderStatus.cancelled],
  [OrderStatus.done]: [],
  [OrderStatus.cancelled]: [],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly deliveryQueue: DeliveryQueueService,
    private readonly kdsService: KdsService,
    private readonly ordersGateway: OrdersGateway,
    private readonly stockGateway: StockGateway,
  ) {}

  // -------------------------------------------------------------------------
  // Helpers — price calculation
  // -------------------------------------------------------------------------

  private getCrustExtraPrice(crust: Crust, sizeLabel: string): number {
    const label = sizeLabel.toLowerCase();
    if (label.startsWith('p') || label.includes('peq') || label.includes('small')) {
      return Number(crust.extraPriceS);
    }
    if (label.startsWith('m') || label.includes('med') || label.includes('édi')) {
      return Number(crust.extraPriceM);
    }
    if (label.startsWith('gg') || label.includes('fam') || label.includes('esp') || label.includes('xl')) {
      return Number(crust.extraPriceXl);
    }
    if (label.startsWith('g') || label.includes('gra') || label.includes('lar')) {
      return Number(crust.extraPriceL);
    }
    return Number(crust.extraPriceL);
  }

  private applyFlavorPriceRule(
    rule: FlavorPriceRule,
    flavorPrices: number[],
    sizePrice: number,
  ): number {
    if (flavorPrices.length === 0) return sizePrice;
    switch (rule) {
      case FlavorPriceRule.highest:
        return Math.max(...flavorPrices);
      case FlavorPriceRule.average:
        return flavorPrices.reduce((s, p) => s + p, 0) / flavorPrices.length;
      case FlavorPriceRule.fixed:
        return sizePrice;
    }
  }

  // RN02 — verifica se o horário atual está dentro da janela configurada
  private isWithinBusinessHours(businessHours: unknown, now: Date): boolean {
    if (!businessHours || typeof businessHours !== 'object') return true; // sem config → permite

    const dayKey = String(now.getDay()); // "0"–"6"
    const schedule = (businessHours as Record<string, DaySchedule>)[dayKey];

    if (!schedule) return true; // dia não configurado → permite
    if (!schedule.open) return false; // dia marcado como fechado

    if (!schedule.from || !schedule.to) return true; // aberto sem janela → permite

    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };

    const current = now.getHours() * 60 + now.getMinutes();
    const from = toMinutes(schedule.from);
    const to = toMinutes(schedule.to);

    // Suporta janelas que cruzam meia-noite (ex: 22:00–02:00)
    if (from <= to) return current >= from && current <= to;
    return current >= from || current <= to;
  }

  // -------------------------------------------------------------------------
  // RN09 — Validar estoque disponível antes de debitar
  // -------------------------------------------------------------------------

  private async validateStockAvailability(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string | null; quantity: number }>,
  ) {
    for (const item of items) {
      if (!item.productId) continue;

      const recipes = await tx.productRecipe.findMany({
        where: { productId: item.productId },
        include: {
          stockItem: { select: { id: true, name: true, quantity: true } },
        },
      });

      for (const recipe of recipes) {
        const needed = recipe.quantity.mul(item.quantity);
        if (recipe.stockItem.quantity.lessThan(needed)) {
          throw new UnprocessableEntityException(
            `Estoque insuficiente para "${recipe.stockItem.name}": disponível ${Number(recipe.stockItem.quantity).toFixed(3)}, necessário ${Number(needed).toFixed(3)}`,
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Resolve items — reutilizado por create() e updateItems()
  // -------------------------------------------------------------------------

  private async resolveItems(
    pizzeriaId: string,
    items: CreateOrderItemDto[],
  ): Promise<ResolvedItem[]> {
    const resolved: ResolvedItem[] = [];

    for (const item of items) {
      const product = await this.prisma.db.product.findFirst({
        where: { id: item.productId, pizzeriaId, isActive: true },
      });
      if (!product) {
        throw new NotFoundException(`Produto ${item.productId} não encontrado ou inativo`);
      }

      let basePrice = 0;
      let sizeLabel: string | null = null;

      if (item.productSizeId) {
        const size = await this.prisma.db.productSize.findFirst({
          where: { id: item.productSizeId, productId: product.id, isActive: true },
        });
        if (!size) throw new NotFoundException(`Tamanho ${item.productSizeId} não encontrado`);
        basePrice = Number(size.price);
        sizeLabel = size.sizeLabel;
      }

      let flavorsData: FlavorData[] | null = null;
      let unitPrice = basePrice;

      if (product.isPizza && item.flavors?.length) {
        const maxFlavors = product.maxFlavors ?? 1;
        if (item.flavors.length > maxFlavors) {
          throw new BadRequestException(
            `Produto "${product.name}" aceita no máximo ${maxFlavors} sabor(es)`,
          );
        }

        const flavorPrices: number[] = [];
        flavorsData = [];

        for (const flavorRef of item.flavors) {
          const flavorProduct = await this.prisma.db.product.findFirst({
            where: { id: flavorRef.productId, pizzeriaId, isActive: true },
            include: {
              sizes: {
                where: { sizeLabel: sizeLabel ?? undefined, isActive: true },
                take: 1,
              },
            },
          });
          if (!flavorProduct) {
            throw new NotFoundException(`Sabor ${flavorRef.productId} não encontrado`);
          }
          const flavorSize = flavorProduct.sizes[0];
          const flavorPrice = flavorSize ? Number(flavorSize.price) : basePrice;
          flavorPrices.push(flavorPrice);
          flavorsData.push({ productId: flavorProduct.id, name: flavorProduct.name, price: flavorPrice });
        }

        unitPrice = this.applyFlavorPriceRule(product.flavorPriceRule, flavorPrices, basePrice);
      }

      if (item.crustId) {
        const crust = await this.prisma.db.crust.findFirst({
          where: { id: item.crustId, pizzeriaId, isActive: true },
        });
        if (!crust) throw new NotFoundException(`Borda ${item.crustId} não encontrada`);
        if (sizeLabel) unitPrice += this.getCrustExtraPrice(crust, sizeLabel);
      }

      const unitPriceDecimal = new Prisma.Decimal(unitPrice.toFixed(2));
      resolved.push({
        productId: item.productId,
        productSizeId: item.productSizeId,
        crustId: item.crustId,
        quantity: item.quantity,
        unitPrice: unitPriceDecimal,
        subtotal: unitPriceDecimal.mul(item.quantity),
        flavors: flavorsData,
        notes: item.notes,
      });
    }

    return resolved;
  }

  // -------------------------------------------------------------------------
  // Create order — RF03, RF04
  // -------------------------------------------------------------------------

  async create(pizzeriaId: string, dto: CreateOrderDto, userId: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('O pedido deve ter pelo menos 1 item');
    }
    if (dto.type === OrderType.delivery && !dto.deliveryAddressId) {
      throw new BadRequestException('Endereço de entrega obrigatório para pedido delivery');
    }
    if (dto.type === OrderType.table && !dto.tableId) {
      throw new BadRequestException('Mesa obrigatória para pedido tipo mesa');
    }
    if (dto.couponCode && !dto.customerId) {
      throw new BadRequestException('Informe o cliente (customerId) para aplicar um cupom');
    }

    // Carregar configuração da pizzaria (RN02, RN07, RN10)
    const config = await this.prisma.db.pizzeriaConfig.findUnique({
      where: { pizzeriaId },
      select: {
        minDeliveryOrder: true,
        serviceFeePct: true,
        serviceFeeAppliesTo: true,
        acceptingOrders: true,
        businessHours: true,
        requireOpenCashier: true,
        freeDeliveryAbove: true,
      },
    });

    if (config && !config.acceptingOrders) {
      throw new BadRequestException('A pizzaria não está aceitando pedidos no momento');
    }

    // RN02 — horário de funcionamento (apenas delivery)
    if (dto.type === OrderType.delivery && config?.businessHours) {
      if (!this.isWithinBusinessHours(config.businessHours, new Date())) {
        throw new BadRequestException(
          'Pedidos delivery não são aceitos fora do horário de funcionamento (RN02)',
        );
      }
    }

    // RN — Bloquear pedidos se caixa obrigatório estiver fechado
    if (config?.requireOpenCashier) {
      const openSession = await this.prisma.db.cashSession.findFirst({
        where: { pizzeriaId, closedAt: null },
        select: { id: true },
      });
      if (!openSession) {
        throw new BadRequestException(
          'Caixa fechado. Abra o caixa antes de registrar pedidos.',
        );
      }
    }

    if (dto.customerId) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { id: dto.customerId, pizzeriaId },
      });
      if (!customer) throw new NotFoundException('Cliente não encontrado');
      if (customer.isBlacklisted) {
        throw new BadRequestException('Cliente está na lista negra e não pode fazer pedidos');
      }
    }

    // Validar tableSessionId pertence a uma mesa desta pizzaria
    if (dto.tableSessionId) {
      const session = await this.prisma.db.tableSession.findFirst({
        where: { id: dto.tableSessionId, table: { pizzeriaId } },
      });
      if (!session) throw new NotFoundException('Sessão de mesa não encontrada nesta pizzaria');
      if (session.closedAt) throw new BadRequestException('Sessão de mesa já encerrada');
    }

    const resolvedItems = await this.resolveItems(pizzeriaId, dto.items);

    // Verifica se todos os itens são de categorias que não precisam de preparo (ex: bebidas)
    const itemCategories = await this.prisma.db.product.findMany({
      where: { id: { in: dto.items.map((i) => i.productId) }, pizzeriaId },
      select: { category: { select: { requiresKitchen: true } } },
    });
    const needsKitchen = itemCategories.some((p) => p.category.requiresKitchen);
    const initialStatus = needsKitchen ? OrderStatus.accepted : OrderStatus.ready;

    const subtotal = resolvedItems.reduce(
      (sum, i) => sum.plus(i.subtotal),
      new Prisma.Decimal(0),
    );

    // RN07 — valor mínimo delivery
    if (dto.type === OrderType.delivery && config?.minDeliveryOrder) {
      if (subtotal.lessThan(config.minDeliveryOrder)) {
        throw new BadRequestException(
          `Pedido mínimo para delivery: R$ ${config.minDeliveryOrder.toFixed(2)}. Subtotal atual: R$ ${subtotal.toFixed(2)}`,
        );
      }
    }

    // RN06 — cupom
    let discount = new Prisma.Decimal(0);
    let couponId: string | undefined;

    if (dto.couponCode) {
      const coupon = await this.prisma.db.coupon.findFirst({
        where: { pizzeriaId, code: dto.couponCode, isActive: true },
        include: { usages: true },
      });

      if (!coupon) throw new BadRequestException('Cupom inválido ou inativo');
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new BadRequestException('Cupom expirado');
      }
      if (coupon.minOrderValue && subtotal.lessThan(coupon.minOrderValue)) {
        throw new BadRequestException(
          `Valor mínimo para este cupom: R$ ${coupon.minOrderValue.toFixed(2)}`,
        );
      }
      if (coupon.maxUsesTotal && coupon.usages.length >= coupon.maxUsesTotal) {
        throw new BadRequestException('Cupom atingiu o limite máximo de usos');
      }
      if (coupon.maxUsesPerCpf && dto.customerId) {
        const customer = await this.prisma.db.customer.findUnique({ where: { id: dto.customerId } });
        if (customer?.cpf) {
          const cpfCustomers = await this.prisma.db.customer.findMany({
            where: { cpf: customer.cpf, pizzeriaId },
            select: { id: true },
          });
          const cpfIds = cpfCustomers.map((c) => c.id);
          const cpfUsages = coupon.usages.filter((u) => cpfIds.includes(u.customerId));
          if (cpfUsages.length >= coupon.maxUsesPerCpf) {
            throw new BadRequestException('Limite de usos por CPF atingido para este cupom');
          }
        }
      }

      discount = coupon.discountType === DiscountType.percentage
        ? subtotal.mul(coupon.discountValue.div(100))
        : Prisma.Decimal.min(coupon.discountValue, subtotal);
      couponId = coupon.id;
    }

    // RF44/RF45 — calcular taxa de entrega por zona de bairro (RN12)
    let deliveryFee = new Prisma.Decimal(0);
    if (dto.type === OrderType.delivery && dto.deliveryAddressId) {
      const address = await this.prisma.db.customerAddress.findUnique({
        where: { id: dto.deliveryAddressId },
        select: { neighborhood: true },
      });

      if (address) {
        const zone = await this.prisma.db.deliveryZone.findFirst({
          where: {
            pizzeriaId,
            isActive: true,
            type: 'neighborhood',
            name: { equals: address.neighborhood, mode: 'insensitive' },
          },
          select: { fee: true },
        });

        if (!zone) {
          throw new BadRequestException(
            `Entrega não disponível para o bairro "${address.neighborhood}". Verifique a área de cobertura. (RN12)`,
          );
        }

        deliveryFee = zone.fee;
      }

      // RF45 — frete grátis acima de valor configurado
      if (config?.freeDeliveryAbove && subtotal.greaterThanOrEqualTo(config.freeDeliveryAbove)) {
        deliveryFee = new Prisma.Decimal(0);
      }
    }

    // RN10 — taxa de serviço
    let serviceFee = new Prisma.Decimal(0);
    if (config?.serviceFeePct && Number(config.serviceFeePct) > 0) {
      const applies = config.serviceFeeAppliesTo === 'all' || config.serviceFeeAppliesTo === dto.type;
      if (applies) {
        serviceFee = subtotal.mul(config.serviceFeePct).div(100).toDecimalPlaces(2);
      }
    }

    const total = subtotal.minus(discount).plus(deliveryFee).plus(serviceFee);

    const debitedStockIds: string[] = [];

    const order = await this.prisma.db.$transaction(async (tx) => {
      const lastOrder = await tx.order.findFirst({
        where: { pizzeriaId },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

      const newOrder = await tx.order.create({
        data: {
          pizzeriaId,
          orderNumber,
          type: dto.type,
          status: initialStatus,
          acceptedAt: new Date(),
          readyAt: initialStatus === OrderStatus.ready ? new Date() : undefined,
          customerId: dto.customerId,
          tableId: dto.tableId,
          tableSessionId: dto.tableSessionId,
          deliveryAddressId: dto.deliveryAddressId,
          couponId,
          subtotal,
          deliveryFee,
          discount,
          serviceFee,
          total,
          notes: dto.notes,
          estimatedTime: dto.estimatedTime,
          parentOrderId: dto.parentOrderId,
          requiresKitchen: needsKitchen,
          items: {
            create: resolvedItems.map((i) => ({
              productId: i.productId,
              productSizeId: i.productSizeId,
              crustId: i.crustId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              subtotal: i.subtotal,
              flavors: i.flavors ? (i.flavors as unknown as Prisma.InputJsonValue) : undefined,
              notes: i.notes,
            })),
          },
        },
        include: { items: true },
      });

      if (couponId && dto.customerId) {
        await tx.couponUsage.create({
          data: { couponId, customerId: dto.customerId, orderId: newOrder.id },
        });
      }

      // RN09/RF76 — validar e debitar estoque (pedido já entra como aceito)
      await this.validateStockAvailability(
        tx,
        newOrder.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      );

      for (const item of newOrder.items) {
        if (!item.productId) continue;
        const recipes = await tx.productRecipe.findMany({ where: { productId: item.productId } });
        for (const recipe of recipes) {
          const consumed = recipe.quantity.mul(item.quantity);
          await tx.stockMovement.create({
            data: {
              stockItemId: recipe.stockItemId,
              type: 'auto_debit',
              quantity: consumed,
              reason: `Baixa automática — pedido #${orderNumber}`,
              orderId: newOrder.id,
            },
          });
          await tx.stockItem.update({
            where: { id: recipe.stockItemId },
            data: { quantity: { decrement: consumed } },
          });
          debitedStockIds.push(recipe.stockItemId);
        }
      }

      return newOrder;
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'order.create',
      entity: 'Order',
      entityId: order.id,
      after: { orderNumber: order.orderNumber, type: order.type, total: String(order.total) },
    });

    this.ordersGateway.notifyOrderCreated(pizzeriaId, order);
    void this.emitStockAlerts(pizzeriaId, debitedStockIds);

    return order;
  }

  // -------------------------------------------------------------------------
  // RF09 — Editar itens do pedido (apenas status = accepted)
  // -------------------------------------------------------------------------

  async updateItems(
    pizzeriaId: string,
    id: string,
    dto: UpdateOrderItemsDto,
    userId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('O pedido deve ter pelo menos 1 item');
    }

    const order = await this.prisma.db.order.findFirst({
      where: { id, pizzeriaId },
      include: { coupon: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (order.status !== OrderStatus.accepted) {
      throw new UnprocessableEntityException(
        `Edição de itens só é permitida no status "accepted". Status atual: "${order.status}"`,
      );
    }

    const resolvedItems = await this.resolveItems(pizzeriaId, dto.items);

    const subtotal = resolvedItems.reduce(
      (sum, i) => sum.plus(i.subtotal),
      new Prisma.Decimal(0),
    );

    // Recalcular desconto do cupom original
    let discount = new Prisma.Decimal(0);
    if (order.coupon) {
      if (order.coupon.discountType === DiscountType.percentage) {
        discount = subtotal.mul(order.coupon.discountValue.div(100));
      } else {
        discount = Prisma.Decimal.min(order.coupon.discountValue, subtotal);
      }
    }

    // Recalcular taxa de serviço
    const config = await this.prisma.db.pizzeriaConfig.findUnique({
      where: { pizzeriaId },
      select: { serviceFeePct: true, serviceFeeAppliesTo: true },
    });
    let serviceFee = new Prisma.Decimal(0);
    if (config?.serviceFeePct && Number(config.serviceFeePct) > 0) {
      const applies = config.serviceFeeAppliesTo === 'all' || config.serviceFeeAppliesTo === order.type;
      if (applies) {
        serviceFee = subtotal.mul(config.serviceFeePct).div(100).toDecimalPlaces(2);
      }
    }

    const total = subtotal.minus(discount).plus(order.deliveryFee).plus(serviceFee);

    const updated = await this.prisma.db.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });

      return tx.order.update({
        where: { id },
        data: {
          subtotal,
          discount,
          serviceFee,
          total,
          items: {
            create: resolvedItems.map((i) => ({
              productId: i.productId,
              productSizeId: i.productSizeId,
              crustId: i.crustId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              subtotal: i.subtotal,
              flavors: i.flavors ? (i.flavors as unknown as Prisma.InputJsonValue) : undefined,
              notes: i.notes,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'order.update_items',
      entity: 'Order',
      entityId: id,
      before: { subtotal: String(order.subtotal), total: String(order.total) },
      after: { subtotal: String(subtotal), total: String(total) },
    });

    this.ordersGateway.notifyOrderUpdated(pizzeriaId, updated as unknown as Record<string, unknown>);

    return updated;
  }

  // -------------------------------------------------------------------------
  // Update order header fields (notes, estimatedTime, customerId, deliveryAddressId)
  // -------------------------------------------------------------------------

  async updateOrder(pizzeriaId: string, id: string, dto: UpdateOrderDto, userId: string) {
    const order = await this.prisma.db.order.findFirst({ where: { id, pizzeriaId } });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (['done', 'cancelled'].includes(order.status)) {
      throw new UnprocessableEntityException('Pedido finalizado ou cancelado não pode ser editado');
    }

    if (dto.deliveryAddressId && order.type !== OrderType.delivery) {
      throw new BadRequestException('Endereço de entrega só pode ser alterado em pedidos delivery');
    }

    if (dto.customerId) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { id: dto.customerId, pizzeriaId },
      });
      if (!customer) throw new NotFoundException('Cliente não encontrado');
    }

    const updated = await this.prisma.db.order.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.estimatedTime !== undefined && { estimatedTime: dto.estimatedTime }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        ...(dto.deliveryAddressId !== undefined && { deliveryAddressId: dto.deliveryAddressId }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'order.update',
      entity: 'Order',
      entityId: id,
      before: {
        notes: order.notes,
        estimatedTime: order.estimatedTime,
        customerId: order.customerId,
        deliveryAddressId: order.deliveryAddressId,
      },
      after: dto as Record<string, unknown>,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Cancel individual order item
  // -------------------------------------------------------------------------

  async cancelItem(
    pizzeriaId: string,
    orderId: string,
    itemId: string,
    reason: string,
    userId: string,
  ) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId, pizzeriaId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (['done', 'cancelled'].includes(order.status)) {
      throw new UnprocessableEntityException('Pedido finalizado ou cancelado');
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item não encontrado neste pedido');
    if (item.cancelledAt) throw new BadRequestException('Item já foi cancelado');

    if (order.items.filter((i) => !i.cancelledAt).length <= 1) {
      throw new BadRequestException(
        'Não é possível cancelar o último item ativo. Cancele o pedido inteiro.',
      );
    }

    await this.prisma.db.orderItem.update({
      where: { id: itemId },
      data: { cancelledAt: new Date(), cancelReason: reason || null },
    });

    // Recalcular totais com os itens restantes
    const activeItems = order.items.filter((i) => i.id !== itemId && !i.cancelledAt);
    const newSubtotal = activeItems.reduce(
      (sum, i) => sum.plus(i.subtotal),
      new Prisma.Decimal(0),
    );

    const config = await this.prisma.db.pizzeriaConfig.findUnique({
      where: { pizzeriaId },
      select: { serviceFeePct: true, serviceFeeAppliesTo: true },
    });
    let serviceFee = new Prisma.Decimal(0);
    if (config?.serviceFeePct && Number(config.serviceFeePct) > 0) {
      const applies = config.serviceFeeAppliesTo === 'all' || config.serviceFeeAppliesTo === order.type;
      if (applies) serviceFee = newSubtotal.mul(config.serviceFeePct).div(100).toDecimalPlaces(2);
    }

    const newTotal = newSubtotal.minus(order.discount).plus(order.deliveryFee).plus(serviceFee);

    await this.prisma.db.order.update({
      where: { id: orderId },
      data: { subtotal: newSubtotal, serviceFee, total: newTotal },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'order.item_cancelled',
      entity: 'OrderItem',
      entityId: itemId,
      before: { cancelledAt: null },
      after: { cancelledAt: new Date().toISOString(), cancelReason: reason },
    });

    return { message: 'Item cancelado', itemId };
  }

  // -------------------------------------------------------------------------
  // List orders
  // -------------------------------------------------------------------------

  async findAll(
    pizzeriaId: string,
    filters: {
      status?: OrderStatus;
      type?: OrderType;
      dateFrom?: string;
      dateTo?: string;
      customerId?: string;
      tableId?: string;
      tableSessionId?: string;
      requiresKitchen?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = { pizzeriaId };
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.tableId) where.tableId = filters.tableId;
    if (filters.tableSessionId) where.tableSessionId = filters.tableSessionId;
    if (filters.requiresKitchen !== undefined) where.requiresKitchen = filters.requiresKitchen;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [orders, total] = await this.prisma.db.$transaction([
      this.prisma.db.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: {
            include: {
              product: { select: { id: true, name: true } },
              productSize: { select: { id: true, sizeLabel: true } },
            },
          },
          deliverer: { select: { id: true, name: true } },
          coupon: { select: { id: true, code: true } },
          table: { select: { id: true, number: true } },
        },
      }),
      this.prisma.db.order.count({ where }),
    ]);

    return { orders, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // -------------------------------------------------------------------------
  // Get one order
  // -------------------------------------------------------------------------

  async findOne(pizzeriaId: string, id: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id, pizzeriaId },
      include: {
        customer: { select: { id: true, name: true, phone: true, cpf: true, loyaltyStamps: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, isPizza: true } },
            productSize: { select: { id: true, sizeLabel: true, price: true } },
            crust: { select: { id: true, name: true } },
          },
        },
        deliverer: { select: { id: true, name: true, phone: true } },
        deliveryAddress: true,
        coupon: { select: { id: true, code: true, discountType: true, discountValue: true } },
        table: { select: { id: true, number: true } },
        tableSession: { select: { id: true, openedAt: true } },
        children: {
          select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  // -------------------------------------------------------------------------
  // Get by order number
  // -------------------------------------------------------------------------

  async findByNumber(pizzeriaId: string, orderNumber: number) {
    const order = await this.prisma.db.order.findFirst({
      where: { pizzeriaId, orderNumber },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            productSize: { select: { id: true, sizeLabel: true } },
            crust: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException(`Pedido #${orderNumber} não encontrado`);
    return order;
  }

  // -------------------------------------------------------------------------
  // Update status — RF06, RF07
  // -------------------------------------------------------------------------

  async updateStatus(
    pizzeriaId: string,
    id: string,
    dto: UpdateOrderStatusDto,
    userId: string,
    userRole: PizzeriaUserRole,
  ) {
    const order = await this.prisma.db.order.findFirst({ where: { id, pizzeriaId } });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    // Entregador só pode marcar como "done" pedidos atribuídos a ele
    if (userRole === PizzeriaUserRole.entregador) {
      if (dto.status !== OrderStatus.done) {
        throw new BadRequestException('Entregador só pode confirmar a conclusão da entrega');
      }
      const deliverer = await this.prisma.db.deliverer.findFirst({
        where: { pizzeriaId, userId, isActive: true },
      });
      if (!deliverer || order.delivererId !== deliverer.id) {
        throw new ForbiddenException('Este pedido não está atribuído a você');
      }
    }

    const allowed = TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new UnprocessableEntityException(
        `Transição inválida: ${order.status} → ${dto.status}. Permitidas: ${allowed.join(', ') || 'nenhuma'}`,
      );
    }

    if (dto.status === OrderStatus.delivering && order.type !== OrderType.delivery) {
      throw new BadRequestException('Status "delivering" é exclusivo de pedidos delivery');
    }

    const timestamps: Partial<{
      acceptedAt: Date;
      readyAt: Date;
      deliveredAt: Date;
      cancelledAt: Date;
    }> = {};
    if (dto.status === OrderStatus.accepted) timestamps.acceptedAt = new Date();
    if (dto.status === OrderStatus.ready) timestamps.readyAt = new Date();
    if (dto.status === OrderStatus.done) timestamps.deliveredAt = new Date();
    if (dto.status === OrderStatus.cancelled) timestamps.cancelledAt = new Date();

    const debitedStockIds: string[] = [];

    const updatedOrder = await this.prisma.db.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          estimatedTime: dto.estimatedTime ?? order.estimatedTime,
          ...timestamps,
        },
      });

      // RN09/RF76 — validar e debitar estoque ao aceitar pedido
      if (dto.status === OrderStatus.accepted) {
        const items = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { productId: true, quantity: true },
        });

        await this.validateStockAvailability(tx, items);

        for (const item of items) {
          if (!item.productId) continue;

          const recipes = await tx.productRecipe.findMany({
            where: { productId: item.productId },
          });

          for (const recipe of recipes) {
            const consumed = recipe.quantity.mul(item.quantity);

            await tx.stockMovement.create({
              data: {
                stockItemId: recipe.stockItemId,
                type: 'auto_debit',
                quantity: consumed,
                reason: `Baixa automática — pedido #${order.orderNumber ?? id}`,
                orderId: id,
              },
            });

            await tx.stockItem.update({
              where: { id: recipe.stockItemId },
              data: { quantity: { decrement: consumed } },
            });

            debitedStockIds.push(recipe.stockItemId);
          }
        }
      }

      // RF52/RF88 — selos de fidelidade ao finalizar (com verificação de validade)
      if (dto.status === OrderStatus.done && order.customerId) {
        const program = await tx.loyaltyProgram.findFirst({
          where: { pizzeriaId, isActive: true },
          select: { validityDays: true },
        });

        let resetStamps = false;
        if (program?.validityDays) {
          // Verificar se o último pedido finalizado (exceto o atual) está dentro da validade
          const lastDone = await tx.order.findFirst({
            where: {
              pizzeriaId,
              customerId: order.customerId,
              status: OrderStatus.done,
              id: { not: id },
            },
            orderBy: { deliveredAt: 'desc' },
            select: { deliveredAt: true },
          });

          if (lastDone?.deliveredAt) {
            const expiresAt = new Date(lastDone.deliveredAt);
            expiresAt.setDate(expiresAt.getDate() + program.validityDays);
            resetStamps = new Date() > expiresAt;
          }
        }

        await tx.customer.update({
          where: { id: order.customerId },
          data: { loyaltyStamps: resetStamps ? 1 : { increment: 1 } },
        });
      }

      return updated;
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'order.status_update',
      entity: 'Order',
      entityId: id,
      before: { status: order.status },
      after: { status: dto.status },
    });

    this.ordersGateway.notifyOrderStatusChanged(pizzeriaId, {
      orderId: id,
      orderNumber: order.orderNumber,
      previousStatus: order.status,
      status: dto.status,
      updatedAt: new Date(),
    });
    void this.emitStockAlerts(pizzeriaId, debitedStockIds);

    // Auto-assign deliverer via queue when kitchen marks delivery order as ready
    if (dto.status === OrderStatus.ready && order.type === OrderType.delivery) {
      this.deliveryQueue.assignNextDeliverer(pizzeriaId, id).catch(() => {
        // Silently ignored — order remains visible in "Disponíveis" for manual claim
      });
    }

    // Reverse queue: when deliverer finishes, assign them the oldest waiting order
    if (
      dto.status === OrderStatus.done &&
      order.type === OrderType.delivery &&
      order.delivererId
    ) {
      this.deliveryQueue
        .tryAssignPendingDelivery(pizzeriaId, order.delivererId)
        .catch(() => {});
    }

    // KDS — RF20: adiciona itens à fila da cozinha quando pedido é aceito
    if (dto.status === OrderStatus.accepted && order.requiresKitchen) {
      this.prisma.db.orderItem
        .findMany({ where: { orderId: id }, select: { id: true, productId: true, quantity: true, notes: true } })
        .then((items) =>
          // Map DB items to KDS input shape (include orderItemId)
          this.kdsService.addItemsToQueue(
            pizzeriaId,
            id,
            order.orderNumber,
            items.map((it) => ({ orderItemId: it.id, productId: it.productId, quantity: it.quantity, notes: it.notes })),
          ),
        )
        .catch(() => {
          // Silencioso — KDS não deve derrubar a operação principal
        });
    }

    return updatedOrder;
  }

  // -------------------------------------------------------------------------
  // Cancel order — RF08 + RN05
  // -------------------------------------------------------------------------

  async cancel(
    pizzeriaId: string,
    id: string,
    dto: CancelOrderDto,
    userId: string,
    userRole: PizzeriaUserRole,
  ) {
    const order = await this.prisma.db.order.findFirst({ where: { id, pizzeriaId } });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (!TRANSITIONS[order.status].includes(OrderStatus.cancelled)) {
      throw new UnprocessableEntityException(
        `Pedido no status "${order.status}" não pode ser cancelado`,
      );
    }

    // RN05 — cancelamento após pagamento exige Admin da unidade
    if (order.paymentStatus === 'paid') {
      if (userRole !== PizzeriaUserRole.admin) {
        throw new ForbiddenException(
          'Cancelamento de pedido já pago requer aprovação do Admin da unidade (RN05)',
        );
      }
    }

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.cancelled,
          cancelReason: dto.reason,
          cancelledAt: new Date(),
        },
      });

      // RN05 — reverter baixa automática de estoque ao cancelar
      const stockMovements = await tx.stockMovement.findMany({
        where: { orderId: id, type: 'auto_debit' },
      });

      for (const movement of stockMovements) {
        await tx.stockMovement.create({
          data: {
            stockItemId: movement.stockItemId,
            type: 'adjustment',
            quantity: movement.quantity,
            reason: `Estorno — cancelamento pedido #${order.orderNumber ?? id}`,
            orderId: id,
            createdBy: userId,
          },
        });
        await tx.stockItem.update({
          where: { id: movement.stockItemId },
          data: { quantity: { increment: movement.quantity } },
        });
      }

      return result;
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'order.cancel',
      entity: 'Order',
      entityId: id,
      before: { status: order.status, paymentStatus: order.paymentStatus },
      after: { status: 'cancelled', cancelReason: dto.reason },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Register payment
  // -------------------------------------------------------------------------

  async registerPayment(
    pizzeriaId: string,
    id: string,
    dto: RegisterPaymentDto,
    userId: string,
  ) {
    const order = await this.prisma.db.order.findFirst({ where: { id, pizzeriaId } });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (order.paymentStatus === 'paid') {
      throw new BadRequestException('Este pedido já foi pago');
    }

    if (dto.paymentMethod === 'cash' && dto.amountReceived !== undefined) {
      const paid = new Prisma.Decimal(dto.amountReceived);
      if (paid.lessThan(order.total)) {
        throw new BadRequestException(
          `Valor recebido (R$ ${paid.toFixed(2)}) menor que o total do pedido (R$ ${order.total.toFixed(2)})`,
        );
      }
    }

    const updated = await this.prisma.db.order.update({
      where: { id },
      data: { paymentMethod: dto.paymentMethod, paymentStatus: 'paid' },
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'order.payment',
      entity: 'Order',
      entityId: id,
      after: { method: dto.paymentMethod, total: String(order.total) },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // My deliveries — pedidos atribuídos ao entregador logado
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Available deliveries — pedidos prontos sem entregador (para o painel do entregador)
  // -------------------------------------------------------------------------

  async availableDeliveries(pizzeriaId: string) {
    return this.prisma.db.order.findMany({
      where: {
        pizzeriaId,
        type: OrderType.delivery,
        status: OrderStatus.ready,
        delivererId: null,
      },
      orderBy: { readyAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        deliveryAddress: true,
        items: {
          include: {
            product: { select: { id: true, name: true } },
            productSize: { select: { id: true, sizeLabel: true } },
          },
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Claim delivery — entregador se auto-atribui e inicia entrega
  // -------------------------------------------------------------------------

  async claimDelivery(pizzeriaId: string, orderId: string, userId: string) {
    const deliverer = await this.prisma.db.deliverer.findFirst({
      where: { pizzeriaId, userId, isActive: true },
    });
    if (!deliverer) {
      throw new NotFoundException('Nenhum entregador ativo vinculado a este usuário nesta pizzaria');
    }

    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId, pizzeriaId },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.type !== OrderType.delivery) {
      throw new BadRequestException('Apenas pedidos delivery podem ser reivindicados');
    }
    if (order.status !== OrderStatus.ready) {
      throw new BadRequestException('Apenas pedidos com status "pronto" podem ser reivindicados');
    }
    // Block deliverer if already on an active route
    const activeRoute = await this.prisma.db.order.findFirst({
      where: { pizzeriaId, delivererId: deliverer.id, status: OrderStatus.delivering },
    });
    if (activeRoute) {
      throw new BadRequestException(
        `Você já está em rota com o pedido #${activeRoute.orderNumber}. Conclua a entrega atual antes de assumir outra.`,
      );
    }

    if (order.delivererId && order.delivererId !== deliverer.id) {
      throw new BadRequestException('Este pedido já foi atribuído a outro entregador');
    }

    const updated = await this.prisma.db.order.update({
      where: { id: orderId },
      data: {
        delivererId: deliverer.id,
        status: OrderStatus.delivering,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        deliveryAddress: true,
        items: {
          include: {
            product: { select: { id: true, name: true } },
            productSize: { select: { id: true, sizeLabel: true } },
          },
        },
      },
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'order.claim_delivery',
      entity: 'Order',
      entityId: orderId,
      after: { delivererId: deliverer.id, status: OrderStatus.delivering },
    });

    return updated;
  }

  async findMyDeliveries(pizzeriaId: string, userId: string) {
    // Localiza o Deliverer vinculado a este usuário da plataforma
    const deliverer = await this.prisma.db.deliverer.findFirst({
      where: { pizzeriaId, userId, isActive: true },
    });

    if (!deliverer) {
      throw new NotFoundException(
        'Nenhum entregador ativo vinculado a este usuário nesta pizzaria',
      );
    }

    const [active, recent] = await this.prisma.db.$transaction([
      // Pedidos aguardando retirada ou em rota
      this.prisma.db.order.findMany({
        where: {
          pizzeriaId,
          delivererId: deliverer.id,
          status: { in: [OrderStatus.ready, OrderStatus.delivering] },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          deliveryAddress: true,
          items: {
            include: {
              product: { select: { id: true, name: true } },
              productSize: { select: { id: true, sizeLabel: true } },
            },
          },
        },
      }),
      // Últimas 20 entregas concluídas hoje
      this.prisma.db.order.findMany({
        where: {
          pizzeriaId,
          delivererId: deliverer.id,
          status: OrderStatus.done,
          deliveredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        orderBy: { deliveredAt: 'desc' },
        take: 20,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          deliveryAddress: true,
          items: {
            include: {
              product: { select: { id: true, name: true } },
              productSize: { select: { id: true, sizeLabel: true } },
            },
          },
        },
      }),
    ]);

    return { deliverer, active, recent };
  }

  private async emitStockAlerts(pizzeriaId: string, stockItemIds: string[]) {
    if (stockItemIds.length === 0) return;
    const items = await this.prisma.db.stockItem.findMany({
      where: { id: { in: stockItemIds } },
      select: { id: true, name: true, quantity: true, minQuantity: true, unit: true },
    });
    const alerts = items.filter((i) => i.quantity.lte(i.minQuantity));
    if (alerts.length > 0) {
      // RN04 — emitir evento WebSocket stock:alert para todos conectados na sala da pizzaria
      this.stockGateway.notifyStockAlert(
        pizzeriaId,
        alerts.map((a) => ({
          id: a.id,
          name: a.name,
          quantity: Number(a.quantity),
          minQuantity: Number(a.minQuantity),
          unit: a.unit,
        })),
      );
    }
  }
}
