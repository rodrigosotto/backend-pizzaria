import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KdsItemStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { KdsGateway } from './kds.gateway';

export type { JwtPayload } from '../modules/auth/auth.service';

// Limite para item "atrasado": 15 minutos sem sair de PENDING
const LATE_THRESHOLD_MINUTES = 15;
// Tempo de retenção de itens DONE antes da limpeza automática: 2 horas
const DONE_RETENTION_HOURS = 2;

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface OrderItemInput {
  productId: string;
  quantity: number;
  notes?: string | null;
  product?: { name: string } | null;
  // Prisma pode retornar o produto nested em formas diferentes
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class KdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gateway: KdsGateway,
  ) {}

  // =========================================================================
  // INTEGRAÇÃO COM PEDIDOS — RF20
  // =========================================================================

  /**
   * Cria registros KDS para todos os itens de um pedido recém-aceito.
   * Chamado pelo OrdersService quando o status muda para ACCEPTED.
   * Só cria itens para produtos que requerem cozinha.
   */
  async addItemsToQueue(
    pizzariaId: string,
    orderId: string,
    orderNumber: number,
    items: OrderItemInput[],
  ): Promise<void> {
    if (!items.length) return;

    // Filtra produtos que requerem cozinha via categoria
    const productIds = items.map((i) => i.productId).filter(Boolean);
    const products = await this.prisma.db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        category: { select: { requiresKitchen: true } },
      },
    });

    const kitchenProductMap = new Map(
      products
        .filter((p) => p.category.requiresKitchen)
        .map((p) => [p.id, p.name]),
    );

    const kdsData: Prisma.KdsItemCreateManyInput[] = items
      .filter((i) => kitchenProductMap.has(i.productId))
      .map((i) => ({
        pizzeriaId: pizzariaId,
        orderId,
        orderNumber,
        productId: i.productId,
        productName: kitchenProductMap.get(i.productId)!,
        quantity: i.quantity,
        notes: i.notes ?? undefined,
        status: KdsItemStatus.pending,
      }));

    if (!kdsData.length) return;

    const { count } = await this.prisma.db.kdsItem.createMany({ data: kdsData });

    if (count > 0) {
      // Busca os registros criados para emitir pelo WebSocket
      const created = await this.prisma.db.kdsItem.findMany({
        where: { orderId, pizzeriaId: pizzariaId },
        orderBy: { createdAt: 'asc' },
      });
      this.gateway.notifyItemNew(pizzariaId, created);
    }
  }

  // =========================================================================
  // FILA — RF21
  // =========================================================================

  /** Retorna a fila da cozinha, ordenada por createdAt ASC. */
  async getQueue(pizzariaId: string, statusFilter?: KdsItemStatus) {
    const where: Prisma.KdsItemWhereInput = { pizzeriaId: pizzariaId };
    if (statusFilter) where.status = statusFilter;

    return this.prisma.db.kdsItem.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  // =========================================================================
  // ATUALIZAÇÃO DE STATUS — RF22, RF23
  // =========================================================================

  /**
   * Atualiza o status de um item KDS.
   * - pending → preparing: registra startedAt
   * - preparing → done: registra completedAt
   * Emite kds:item:updated via WebSocket.
   */
  async updateItemStatus(
    pizzariaId: string,
    itemId: string,
    newStatus: KdsItemStatus,
    userId: string,
  ) {
    const item = await this.prisma.db.kdsItem.findFirst({
      where: { id: itemId, pizzeriaId: pizzariaId },
    });
    if (!item) throw new NotFoundException('Item KDS não encontrado');

    // Valida transições permitidas
    const TRANSITIONS: Record<KdsItemStatus, KdsItemStatus[]> = {
      [KdsItemStatus.pending]:   [KdsItemStatus.preparing],
      [KdsItemStatus.preparing]: [KdsItemStatus.done],
      [KdsItemStatus.done]:      [],
    };
    if (!TRANSITIONS[item.status].includes(newStatus)) {
      throw new BadRequestException(
        `Transição inválida: ${item.status} → ${newStatus}. Permitidas: ${TRANSITIONS[item.status].join(', ') || 'nenhuma'}`,
      );
    }

    const now = new Date();
    const timestamps: Prisma.KdsItemUpdateInput = {};
    if (newStatus === KdsItemStatus.preparing) timestamps.startedAt = now;
    if (newStatus === KdsItemStatus.done) timestamps.completedAt = now;

    const updated = await this.prisma.db.kdsItem.update({
      where: { id: itemId },
      data: { status: newStatus, ...timestamps },
    });

    this.gateway.notifyItemUpdated(pizzariaId, {
      itemId,
      status: newStatus,
      updatedAt: now,
    });

    await this.audit.log({
      userId,
      pizzeriaId: pizzariaId,
      action: 'kds.status_update',
      entity: 'KdsItem',
      entityId: itemId,
      before: { status: item.status } as Record<string, unknown>,
      after: { status: newStatus } as Record<string, unknown>,
    });

    return updated;
  }

  // =========================================================================
  // MÉTRICAS — RF25
  // =========================================================================

  /**
   * Calcula métricas em tempo real para o turno atual:
   * - tempo médio de preparo (itens DONE com startedAt e completedAt)
   * - contagens por status
   * - itens "atrasados" (PENDING há mais de 15 min)
   */
  async getMetrics(pizzariaId: string) {
    const [pendingItems, preparingItems, doneItems] = await Promise.all([
      this.prisma.db.kdsItem.findMany({
        where: { pizzeriaId: pizzariaId, status: KdsItemStatus.pending },
        select: { id: true, productName: true, orderNumber: true, createdAt: true },
      }),
      this.prisma.db.kdsItem.count({
        where: { pizzeriaId: pizzariaId, status: KdsItemStatus.preparing },
      }),
      this.prisma.db.kdsItem.findMany({
        where: {
          pizzeriaId: pizzariaId,
          status: KdsItemStatus.done,
          startedAt: { not: null },
          completedAt: { not: null },
        },
        select: { startedAt: true, completedAt: true },
      }),
    ]);

    // Tempo médio de preparo (do startedAt ao completedAt), em minutos
    const avgPrepTime =
      doneItems.length > 0
        ? doneItems.reduce((sum, i) => {
            const ms = i.completedAt!.getTime() - i.startedAt!.getTime();
            return sum + ms / 60_000;
          }, 0) / doneItems.length
        : 0;

    // Itens late: PENDING há mais de LATE_THRESHOLD_MINUTES minutos
    const lateThreshold = new Date(Date.now() - LATE_THRESHOLD_MINUTES * 60_000);
    const lateItems = pendingItems.filter((i) => i.createdAt < lateThreshold);

    return {
      avgPrepTime: Math.round(avgPrepTime * 10) / 10, // 1 casa decimal
      pendingCount: pendingItems.length,
      preparingCount: preparingItems,
      doneCount: doneItems.length,
      lateItems: lateItems.map((i) => ({
        id: i.id,
        productName: i.productName,
        orderNumber: i.orderNumber,
        waitingMinutes: Math.floor(
          (Date.now() - i.createdAt.getTime()) / 60_000,
        ),
      })),
    };
  }

  // =========================================================================
  // LIMPEZA DA FILA — RF26
  // =========================================================================

  /**
   * Remove itens com status DONE mais antigos que DONE_RETENTION_HOURS horas.
   * Emite kds:queue:cleared via WebSocket.
   */
  async clearDoneItems(pizzariaId: string, userId: string) {
    const cutoff = new Date(Date.now() - DONE_RETENTION_HOURS * 60 * 60_000);

    const { count } = await this.prisma.db.kdsItem.deleteMany({
      where: {
        pizzeriaId: pizzariaId,
        status: KdsItemStatus.done,
        completedAt: { lt: cutoff },
      },
    });

    if (count > 0) {
      this.gateway.notifyQueueCleared(pizzariaId, count);
    }

    await this.audit.log({
      userId,
      pizzeriaId: pizzariaId,
      action: 'kds.queue_cleared',
      entity: 'KdsItem',
      entityId: pizzariaId,
      after: { removed: count, cutoffHours: DONE_RETENTION_HOURS } as Record<string, unknown>,
    });

    return { cleared: true, removed: count };
  }
}
