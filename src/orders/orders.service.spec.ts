import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { DeliveryQueueService } from '../deliverers/delivery-queue.service';
import { KdsService } from '../kds/kds.service';
import { OrdersGateway } from './orders.gateway';
import { StockGateway } from '../estoque/stock.gateway';

function dec(n: number) {
  return new Prisma.Decimal(n);
}

describe('OrdersService - validateStockAvailability (via cancel + reversal)', () => {
  let service: OrdersService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      db: {
        order: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
        orderItem: { findMany: jest.fn() },
        stockMovement: { findMany: jest.fn(), create: jest.fn() },
        stockItem: { update: jest.fn(), findMany: jest.fn() },
        productRecipe: { findMany: jest.fn() },
        pizzeriaConfig: { findUnique: jest.fn() },
        product: { findMany: jest.fn() },
        customer: { findFirst: jest.fn() },
        coupon: { findFirst: jest.fn() },
        loyaltyProgram: { findFirst: jest.fn() },
        $transaction: jest.fn((cb: Function) => cb(mockPrisma.db)),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: DeliveryQueueService, useValue: { assignNextDeliverer: jest.fn() } },
        { provide: KdsService, useValue: { addToQueue: jest.fn(), removeFromQueue: jest.fn() } },
        { provide: OrdersGateway, useValue: { notifyOrderCreated: jest.fn(), notifyOrderStatusChanged: jest.fn() } },
        { provide: StockGateway, useValue: { notifyStockAlert: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('cancel - reversao de estoque (RN05)', () => {
    it('cancela pedido e reverte movimentos auto_debit', async () => {
      const orderId = 'ord-1';
      mockPrisma.db.order.findFirst.mockResolvedValue({
        id: orderId,
        pizzeriaId: 'piz-1',
        status: 'new',
        orderNumber: 42,
        paymentStatus: 'pending',
      });
      mockPrisma.db.order.update.mockResolvedValue({ id: orderId, status: 'cancelled' });
      mockPrisma.db.stockMovement.findMany.mockResolvedValue([
        { stockItemId: 'stock-1', quantity: dec(2) },
        { stockItemId: 'stock-2', quantity: dec(0.5) },
      ]);
      mockPrisma.db.stockMovement.create.mockResolvedValue({});
      mockPrisma.db.stockItem.update.mockResolvedValue({});

      await service.cancel(
        'piz-1',
        orderId,
        { reason: 'Teste' },
        'user-1',
        'admin' as any,
      );

      expect(mockPrisma.db.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.db.stockItem.update).toHaveBeenCalledTimes(2);

      // Verifica que o segundo movimento criado é do tipo adjustment
      const firstCreateCall = (mockPrisma.db.stockMovement.create as any).mock.calls[0][0];
      expect(firstCreateCall.data.type).toBe('adjustment');
      expect(firstCreateCall.data.stockItemId).toBe('stock-1');
    });

    it('cancela pedido sem movimentos de estoque sem erro', async () => {
      mockPrisma.db.order.findFirst.mockResolvedValue({
        id: 'ord-2',
        pizzeriaId: 'piz-1',
        status: 'new',
        orderNumber: 43,
        paymentStatus: 'pending',
      });
      mockPrisma.db.order.update.mockResolvedValue({ id: 'ord-2', status: 'cancelled' });
      mockPrisma.db.stockMovement.findMany.mockResolvedValue([]);

      await expect(
        service.cancel('piz-1', 'ord-2', { reason: 'Sem estoque' }, 'user-1', 'admin' as any),
      ).resolves.not.toThrow();

      expect(mockPrisma.db.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('validateStockAvailability (RN09) via updateStatus', () => {
    it('lanca UnprocessableEntityException quando estoque insuficiente ao aceitar', async () => {
      const orderId = 'ord-3';

      mockPrisma.db.order.findFirst.mockResolvedValue({
        id: orderId,
        pizzeriaId: 'piz-1',
        status: 'new',
        orderNumber: 44,
        type: 'counter',
        customerId: null,
      });
      mockPrisma.db.orderItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 2 },
      ]);
      mockPrisma.db.productRecipe.findMany.mockResolvedValue([
        {
          stockItemId: 'stock-1',
          quantity: dec(1),
          stockItem: { id: 'stock-1', name: 'Farinha', quantity: dec(1) },
        },
      ]);

      await expect(
        service.updateStatus('piz-1', orderId, { status: 'accepted' as any }, 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('aceita pedido quando estoque e suficiente', async () => {
      const orderId = 'ord-4';

      mockPrisma.db.order.findFirst.mockResolvedValue({
        id: orderId,
        pizzeriaId: 'piz-1',
        status: 'new',
        orderNumber: 45,
        type: 'counter',
        customerId: null,
      });
      mockPrisma.db.order.update.mockResolvedValue({ id: orderId, status: 'accepted' });
      mockPrisma.db.orderItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 1 },
      ]);
      mockPrisma.db.productRecipe.findMany.mockResolvedValue([
        {
          stockItemId: 'stock-1',
          quantity: dec(1),
          stockItem: { id: 'stock-1', name: 'Farinha', quantity: dec(5) },
        },
      ]);
      mockPrisma.db.stockMovement.create.mockResolvedValue({});
      mockPrisma.db.stockItem.update.mockResolvedValue({});
      mockPrisma.db.stockItem.findMany.mockResolvedValue([]);

      await expect(
        service.updateStatus('piz-1', orderId, { status: 'accepted' as any }, 'user-1'),
      ).resolves.not.toThrow();
    });
  });
});
