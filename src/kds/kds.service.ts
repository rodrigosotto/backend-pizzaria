import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { KdsItemStatus } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { KdsGateway } from './kds.gateway';

@Injectable()
export class KdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kdsGateway: KdsGateway,
  ) {}

  async getQueue(pizzeriaId: string) {
    return this.prisma.db.kdsItem.findMany({
      where: {
        pizzeriaId,
        status: { in: [KdsItemStatus.pending, KdsItemStatus.preparing] },
      },
      include: {
        order: { select: { orderNumber: true, type: true } },
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateStatus(pizzeriaId: string, itemId: string, status: KdsItemStatus) {
    const item = await this.prisma.db.kdsItem.findFirst({ where: { id: itemId, pizzeriaId } });
    if (!item) throw new NotFoundException('Item KDS não encontrado');

    const TRANSITIONS: Record<KdsItemStatus, KdsItemStatus | null> = {
      [KdsItemStatus.pending]: KdsItemStatus.preparing,
      [KdsItemStatus.preparing]: KdsItemStatus.done,
      [KdsItemStatus.done]: null,
    };

    if (TRANSITIONS[item.status] !== status) {
      throw new BadRequestException(
        `Transição inválida: ${item.status} → ${status}. Próximo: ${TRANSITIONS[item.status] ?? 'nenhum'}`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.db.kdsItem.update({
      where: { id: itemId },
      data: {
        status,
        startedAt: status === KdsItemStatus.preparing ? now : item.startedAt,
        completedAt: status === KdsItemStatus.done ? now : item.completedAt,
        updatedAt: now,
      },
    });

    this.kdsGateway.notifyItemUpdated(pizzeriaId, {
      itemId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });

    return updated;
  }

  async clearDoneItems(pizzeriaId: string) {
    await this.prisma.db.kdsItem.deleteMany({
      where: { pizzeriaId, status: KdsItemStatus.done },
    });

    this.kdsGateway.notifyQueueCleared(pizzeriaId);

    return { message: 'Itens concluídos removidos da fila' };
  }

  /**
   * Cria itens KDS para todos os order items de categorias que requerem cozinha.
   * Chamado pelo OrdersService quando o pedido transita para `accepted`.
   */
  async createItemsForOrder(pizzeriaId: string, orderId: string) {
    const items = await this.prisma.db.orderItem.findMany({
      where: { orderId, cancelledAt: null },
      include: {
        product: {
          include: { category: { select: { requiresKitchen: true } } },
        },
      },
    });

    const kitchenItems = items.filter((i) => i.product.category.requiresKitchen);
    if (!kitchenItems.length) return;

    const created = await this.prisma.db.kdsItem.createManyAndReturn({
      data: kitchenItems.map((i) => ({
        pizzeriaId,
        orderId,
        orderItemId: i.id,
        productId: i.productId,
        quantity: i.quantity,
        notes: i.notes,
      })),
    });

    this.kdsGateway.notifyItemsNew(pizzeriaId, created);
  }

  /**
   * Remove todos os itens pending/preparing de um pedido cancelado.
   */
  async removeItemsForOrder(pizzeriaId: string, orderId: string) {
    await this.prisma.db.kdsItem.deleteMany({
      where: {
        orderId,
        pizzeriaId,
        status: { in: [KdsItemStatus.pending, KdsItemStatus.preparing] },
      },
    });

    this.kdsGateway.notifyQueueCleared(pizzeriaId);
  }
}
