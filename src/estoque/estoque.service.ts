import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockMovementDto, MovementType } from './dto/create-stock-movement.dto';
import { Prisma, StockCategory } from '@prisma/client';

export type { JwtPayload } from '../modules/auth/auth.service';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class EstoqueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // SUPPLIERS — RF82-RF84
  // =========================================================================

  async listSuppliers(pizzeriaId: string, active?: boolean) {
    const where: Prisma.SupplierWhereInput = { pizzeriaId };
    if (active !== undefined) where.isActive = active;

    return this.prisma.db.supplier.findMany({
      where,
      orderBy: { companyName: 'asc' },
      include: {
        _count: { select: { stockItems: true } },
      },
    });
  }

  async getSupplier(pizzeriaId: string, id: string) {
    const supplier = await this.prisma.db.supplier.findFirst({
      where: { id, pizzeriaId },
      include: {
        stockItems: {
          where: { pizzeriaId },
          select: { id: true, name: true, category: true, unit: true, quantity: true, minQuantity: true },
        },
      },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return supplier;
  }

  async createSupplier(pizzeriaId: string, dto: CreateSupplierDto, userId: string) {
    if (dto.cnpj) {
      const existing = await this.prisma.db.supplier.findFirst({
        where: { pizzeriaId, cnpj: dto.cnpj },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Já existe um fornecedor cadastrado com este CNPJ');
    }

    const supplier = await this.prisma.db.supplier.create({
      data: {
        pizzeriaId,
        companyName: dto.companyName,
        tradeName: dto.tradeName,
        cnpj: dto.cnpj,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address ?? undefined,
        categories: dto.categories ?? [],
      },
    });

    await this.audit.log({
      userId, pizzeriaId, action: 'supplier.create',
      entity: 'Supplier', entityId: supplier.id,
      after: { companyName: supplier.companyName },
    });

    return supplier;
  }

  async updateSupplier(pizzeriaId: string, id: string, dto: UpdateSupplierDto, userId: string) {
    const supplier = await this.prisma.db.supplier.findFirst({ where: { id, pizzeriaId } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');

    if (dto.cnpj && dto.cnpj !== supplier.cnpj) {
      const existing = await this.prisma.db.supplier.findFirst({
        where: { pizzeriaId, cnpj: dto.cnpj, id: { not: id } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Já existe um fornecedor cadastrado com este CNPJ');
    }

    const updated = await this.prisma.db.supplier.update({
      where: { id },
      data: {
        companyName: dto.companyName,
        tradeName: dto.tradeName,
        cnpj: dto.cnpj,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        categories: dto.categories,
        isActive: dto.isActive,
      },
    });

    await this.audit.log({
      userId, pizzeriaId, action: 'supplier.update',
      entity: 'Supplier', entityId: id,
      before: { isActive: supplier.isActive },
      after: { isActive: updated.isActive },
    });

    return updated;
  }

  async removeSupplier(pizzeriaId: string, id: string, userId: string) {
    const supplier = await this.prisma.db.supplier.findFirst({
      where: { id, pizzeriaId },
      include: { _count: { select: { stockItems: true } } },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');

    if (supplier._count.stockItems > 0) {
      throw new BadRequestException(
        `Fornecedor possui ${supplier._count.stockItems} insumo(s) vinculado(s). Desvincule-os antes de remover.`,
      );
    }

    await this.prisma.db.supplier.delete({ where: { id } });

    await this.audit.log({
      userId, pizzeriaId, action: 'supplier.delete',
      entity: 'Supplier', entityId: id,
      before: { companyName: supplier.companyName },
    });

    return { deleted: true };
  }

  async getSupplierPurchases(
    pizzeriaId: string,
    supplierId: string,
    filters: { page?: number; limit?: number },
  ) {
    const supplier = await this.prisma.db.supplier.findFirst({
      where: { id: supplierId, pizzeriaId },
      select: { id: true, companyName: true, tradeName: true },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 30, 100);
    const skip = (page - 1) * limit;

    // Movimentos de entrada dos insumos vinculados a este fornecedor
    const where = {
      type: 'entry',
      stockItem: { supplierId, pizzeriaId },
    };

    const [movements, total] = await this.prisma.db.$transaction([
      this.prisma.db.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          stockItem: { select: { id: true, name: true, unit: true } },
        },
      }),
      this.prisma.db.stockMovement.count({ where }),
    ]);

    return {
      supplier,
      movements,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // =========================================================================
  // STOCK ITEMS — RF72-RF81
  // =========================================================================

  async listStockItems(
    pizzeriaId: string,
    filters: { category?: StockCategory; alertOnly?: boolean; supplierId?: string },
  ) {
    const where: Prisma.StockItemWhereInput = { pizzeriaId };
    if (filters.category) where.category = filters.category;
    if (filters.supplierId) where.supplierId = filters.supplierId;

    const items = await this.prisma.db.stockItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        supplier: { select: { id: true, tradeName: true, companyName: true } },
      },
    });

    // RF74: marcar alertas e filtrar se alertOnly=true (comparação via Decimal)
    const mapped = items.map((item) => ({
      ...item,
      isAlert: item.quantity.lessThanOrEqualTo(item.minQuantity),
    }));

    return filters.alertOnly ? mapped.filter((item) => item.isAlert) : mapped;
  }

  async listAlerts(pizzeriaId: string) {
    const items = await this.prisma.db.$queryRaw<
      Array<{ id: string; name: string; category: string; unit: string; quantity: string; min_quantity: string; supplier_id: string | null }>
    >`
      SELECT id, name, category, unit, quantity::text, min_quantity::text, supplier_id
      FROM stock_items
      WHERE pizzeria_id = ${pizzeriaId}
        AND quantity <= min_quantity
      ORDER BY (quantity / NULLIF(min_quantity, 0)) ASC
    `;

    return items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      unit: i.unit,
      quantity: Number(i.quantity),
      minQuantity: Number(i.min_quantity),
      supplierId: i.supplier_id,
    }));
  }

  async getStockItem(pizzeriaId: string, id: string) {
    const item = await this.prisma.db.stockItem.findFirst({
      where: { id, pizzeriaId },
      include: {
        supplier: { select: { id: true, tradeName: true, companyName: true, phone: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!item) throw new NotFoundException('Insumo não encontrado');

    return {
      ...item,
      isAlert: item.quantity.lessThanOrEqualTo(item.minQuantity),
    };
  }

  async createStockItem(pizzeriaId: string, dto: CreateStockItemDto, userId: string) {
    if (dto.supplierId) {
      const supplier = await this.prisma.db.supplier.findFirst({
        where: { id: dto.supplierId, pizzeriaId, isActive: true },
      });
      if (!supplier) throw new NotFoundException('Fornecedor não encontrado ou inativo');
    }

    const item = await this.prisma.db.stockItem.create({
      data: {
        pizzeriaId,
        supplierId: dto.supplierId,
        name: dto.name,
        category: dto.category,
        unit: dto.unit,
        quantity: new Prisma.Decimal(dto.quantity),
        minQuantity: new Prisma.Decimal(dto.minQuantity),
        costPerUnit: dto.costPerUnit !== undefined ? new Prisma.Decimal(dto.costPerUnit) : undefined,
      },
    });

    // Registrar quantidade inicial como movimento de entrada
    if (dto.quantity > 0) {
      await this.prisma.db.stockMovement.create({
        data: {
          stockItemId: item.id,
          type: 'entry',
          quantity: new Prisma.Decimal(dto.quantity),
          reason: 'Estoque inicial',
          createdBy: userId,
        },
      });
    }

    await this.audit.log({
      userId, pizzeriaId, action: 'stock.create',
      entity: 'StockItem', entityId: item.id,
      after: { name: item.name, quantity: String(item.quantity) },
    });

    return item;
  }

  async updateStockItem(pizzeriaId: string, id: string, dto: UpdateStockItemDto, userId: string) {
    const item = await this.prisma.db.stockItem.findFirst({ where: { id, pizzeriaId } });
    if (!item) throw new NotFoundException('Insumo não encontrado');

    if (dto.supplierId) {
      const supplier = await this.prisma.db.supplier.findFirst({
        where: { id: dto.supplierId, pizzeriaId, isActive: true },
      });
      if (!supplier) throw new NotFoundException('Fornecedor não encontrado ou inativo');
    }

    const updated = await this.prisma.db.stockItem.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        name: dto.name,
        category: dto.category,
        unit: dto.unit,
        minQuantity: dto.minQuantity !== undefined ? new Prisma.Decimal(dto.minQuantity) : undefined,
        costPerUnit: dto.costPerUnit !== undefined ? new Prisma.Decimal(dto.costPerUnit) : undefined,
      },
    });

    await this.audit.log({
      userId, pizzeriaId, action: 'stock.update',
      entity: 'StockItem', entityId: id,
      before: { minQuantity: String(item.minQuantity) },
      after: { minQuantity: String(updated.minQuantity) },
    });

    return updated;
  }

  async removeStockItem(pizzeriaId: string, id: string, userId: string) {
    const item = await this.prisma.db.stockItem.findFirst({
      where: { id, pizzeriaId },
      include: { _count: { select: { movements: true } } },
    });
    if (!item) throw new NotFoundException('Insumo não encontrado');

    if (item._count.movements > 0) {
      throw new BadRequestException(
        'Insumo com movimentações registradas não pode ser removido. Ajuste o estoque para zero se desejar desativá-lo.',
      );
    }

    await this.prisma.db.stockItem.delete({ where: { id } });

    await this.audit.log({
      userId, pizzeriaId, action: 'stock.delete',
      entity: 'StockItem', entityId: id,
      before: { name: item.name },
    });

    return { deleted: true };
  }

  // =========================================================================
  // STOCK MOVEMENTS — RF75, RF77, RF79
  // =========================================================================

  async createMovement(
    pizzeriaId: string,
    stockItemId: string,
    dto: CreateStockMovementDto,
    userId: string,
  ) {
    const item = await this.prisma.db.stockItem.findFirst({
      where: { id: stockItemId, pizzeriaId },
    });
    if (!item) throw new NotFoundException('Insumo não encontrado');

    const qty = new Prisma.Decimal(dto.quantity);

    // Saídas (withdrawal, loss) não podem resultar em estoque negativo
    const isOutflow = dto.type === MovementType.withdrawal || dto.type === MovementType.loss;
    if (isOutflow && qty.greaterThan(item.quantity)) {
      throw new BadRequestException(
        `Quantidade insuficiente. Estoque atual: ${item.quantity} ${item.unit}`,
      );
    }

    // adjustment: qty é o valor absoluto alvo → delta = qty - currentQuantity
    const isAdjustment = dto.type === MovementType.adjustment;

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const delta = isOutflow
        ? qty.negated()
        : isAdjustment
          ? qty.minus(item.quantity)
          : qty;

      await tx.stockMovement.create({
        data: {
          stockItemId,
          type: dto.type,
          quantity: qty,
          reason: dto.reason,
          createdBy: userId,
          orderId: dto.orderId,
        },
      });

      return tx.stockItem.update({
        where: { id: stockItemId },
        data: { quantity: { increment: Number(delta) } },
      });
    });

    await this.audit.log({
      userId, pizzeriaId, action: `stock.movement.${dto.type}`,
      entity: 'StockItem', entityId: stockItemId,
      before: { quantity: String(item.quantity) },
      after: { quantity: String(updated.quantity), type: dto.type },
    });

    return {
      ...updated,
      isAlert: updated.quantity.lessThanOrEqualTo(updated.minQuantity),
    };
  }

  async listMovements(
    pizzeriaId: string,
    stockItemId: string,
    filters: { type?: string; page?: number; limit?: number },
  ) {
    const item = await this.prisma.db.stockItem.findFirst({ where: { id: stockItemId, pizzeriaId } });
    if (!item) throw new NotFoundException('Insumo não encontrado');

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 30, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = { stockItemId };
    if (filters.type) where.type = filters.type;

    const [movements, total] = await this.prisma.db.$transaction([
      this.prisma.db.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.db.stockMovement.count({ where }),
    ]);

    return { movements, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
