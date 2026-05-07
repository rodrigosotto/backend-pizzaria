import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { DeliveryGateway } from './delivery.gateway';

@Injectable()
export class DeliveryQueueService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gateway?: DeliveryGateway,
  ) {}

  /**
   * Assigns the next available deliverer to an order using FIFO queue logic:
   * - Excludes deliverers currently on an active delivery (status = delivering)
   * - Among available ones, prioritises who finished their last delivery earliest
   *   (deliverers with no previous deliveries come first)
   * Returns the assigned deliverer id, or null if no one is available.
   */
  async assignNextDeliverer(
    pizzeriaId: string,
    orderId: string,
  ): Promise<string | null> {
    // Step 1 — IDs of deliverers currently on an active route
    const busyRows = await this.prisma.db.order.findMany({
      where: {
        pizzeriaId,
        status: 'delivering',
        delivererId: { not: null },
      },
      select: { delivererId: true },
    });
    const busyIds = busyRows.map((r) => r.delivererId!).filter(Boolean);

    // Step 2 — Available deliverers (active + linked user + not busy)
    const candidates = await this.prisma.db.deliverer.findMany({
      where: {
        pizzeriaId,
        isActive: true,
        userId: { not: null },
        ...(busyIds.length > 0 ? { id: { notIn: busyIds } } : {}),
      },
      include: {
        orders: {
          where: { status: 'done', deliveredAt: { not: null } },
          orderBy: { deliveredAt: 'desc' },
          take: 1,
          select: { deliveredAt: true },
        },
      },
    });

    // Step 2b — If no deliverer available, notify pizzeria room so entregadores can see the available delivery
    if (candidates.length === 0) {
      const order = await this.prisma.db.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, total: true },
      });
      if (order) {
        this.gateway?.notifyDeliveryAvailable(pizzeriaId, order);
      }
      return null;
    }

    // Step 3 — Sort: no prior deliveries first, then by oldest last-delivery time
    candidates.sort((a, b) => {
      const aTime = a.orders[0]?.deliveredAt?.getTime() ?? 0;
      const bTime = b.orders[0]?.deliveredAt?.getTime() ?? 0;
      return aTime - bTime;
    });

    const next = candidates[0];

    const updatedOrder = await this.prisma.db.order.update({
      where: { id: orderId },
      data: { delivererId: next.id },
      select: { id: true, orderNumber: true, total: true, deliveryAddressId: true },
    });

    // Notify the assigned deliverer via WebSocket
    this.gateway?.notifyDelivererAssigned(next.id, updatedOrder);

    return next.id;
  }

  /**
   * Called when a deliverer finishes a delivery (status → done).
   * Finds the oldest unassigned ready delivery order and assigns it to this deliverer.
   * Implements the reverse queue: freed deliverer picks up the next waiting order.
   */
  async tryAssignPendingDelivery(
    pizzeriaId: string,
    delivererId: string,
  ): Promise<string | null> {
    const pending = await this.prisma.db.order.findFirst({
      where: {
        pizzeriaId,
        type: 'delivery',
        status: 'ready',
        delivererId: null,
      },
      orderBy: { readyAt: 'asc' }, // FIFO — oldest waiting order first
    });

    if (!pending) return null;

    const updatedOrder = await this.prisma.db.order.update({
      where: { id: pending.id },
      data: { delivererId },
      select: { id: true, orderNumber: true, total: true, deliveryAddressId: true },
    });

    // Notify the deliverer via WebSocket
    this.gateway?.notifyDelivererAssigned(delivererId, updatedOrder);

    return pending.id;
  }
}
