import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';

describe('LoyaltyService - getCustomerLoyaltyStatus', () => {
  let service: LoyaltyService;
  let mockPrisma: any;

  const pizzeriaId = 'piz-1';
  const customerId = 'cust-1';

  const baseCustomer = { id: customerId, name: 'Joao', loyaltyStamps: 3 };
  const baseProgram = {
    id: 'prog-1',
    name: 'Fidelidade',
    stampsGoal: 10,
    reward: 'Pizza gratis',
    validityDays: null,
    isActive: true,
  };

  beforeEach(async () => {
    mockPrisma = {
      db: {
        customer: {
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        loyaltyProgram: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        order: {
          findFirst: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
  });

  it('lanca NotFoundException se cliente nao encontrado', async () => {
    mockPrisma.db.customer.findFirst.mockResolvedValue(null);

    await expect(service.getCustomerLoyaltyStatus(pizzeriaId, customerId))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('retorna program null se nao ha programa ativo', async () => {
    mockPrisma.db.customer.findFirst.mockResolvedValue(baseCustomer);
    mockPrisma.db.loyaltyProgram.findFirst.mockResolvedValue(null);

    const result = await service.getCustomerLoyaltyStatus(pizzeriaId, customerId);

    expect(result.program).toBeNull();
    expect(result.stampsValid).toBe(false);
  });

  it('retorna stampsValid true se validityDays nao configurado', async () => {
    mockPrisma.db.customer.findFirst.mockResolvedValue(baseCustomer);
    mockPrisma.db.loyaltyProgram.findFirst.mockResolvedValue({ ...baseProgram, validityDays: null });

    const result = await service.getCustomerLoyaltyStatus(pizzeriaId, customerId);

    expect(result.stampsValid).toBe(true);
    expect(result.stamps).toBe(3);
  });

  it('retorna stampsToGoal correto', async () => {
    mockPrisma.db.customer.findFirst.mockResolvedValue(baseCustomer);
    mockPrisma.db.loyaltyProgram.findFirst.mockResolvedValue({ ...baseProgram, stampsGoal: 10 });

    const result = await service.getCustomerLoyaltyStatus(pizzeriaId, customerId);

    expect(result.stampsToGoal).toBe(7);
  });

  it('retorna rewardReached true quando selos >= meta', async () => {
    mockPrisma.db.customer.findFirst.mockResolvedValue({ ...baseCustomer, loyaltyStamps: 10 });
    mockPrisma.db.loyaltyProgram.findFirst.mockResolvedValue({ ...baseProgram, stampsGoal: 10 });

    const result = await service.getCustomerLoyaltyStatus(pizzeriaId, customerId);

    expect(result.rewardReached).toBe(true);
  });

  it('retorna stampsValid false e zera selos quando expirado', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    mockPrisma.db.customer.findFirst.mockResolvedValue({ ...baseCustomer, loyaltyStamps: 5 });
    mockPrisma.db.loyaltyProgram.findFirst.mockResolvedValue({ ...baseProgram, validityDays: 30 });
    mockPrisma.db.order.findFirst.mockResolvedValue({ deliveredAt: oldDate });
    mockPrisma.db.customer.update.mockResolvedValue({});

    const result = await service.getCustomerLoyaltyStatus(pizzeriaId, customerId);

    expect(result.stampsValid).toBe(false);
    expect(mockPrisma.db.customer.update).toHaveBeenCalledWith({
      where: { id: customerId },
      data: { loyaltyStamps: 0 },
    });
    expect(result.stamps).toBe(0);
  });

  it('retorna stampsValid true quando dentro da validade', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);

    mockPrisma.db.customer.findFirst.mockResolvedValue({ ...baseCustomer, loyaltyStamps: 3 });
    mockPrisma.db.loyaltyProgram.findFirst.mockResolvedValue({ ...baseProgram, validityDays: 30 });
    mockPrisma.db.order.findFirst.mockResolvedValue({ deliveredAt: recentDate });

    const result = await service.getCustomerLoyaltyStatus(pizzeriaId, customerId);

    expect(result.stampsValid).toBe(true);
    expect(mockPrisma.db.customer.update).not.toHaveBeenCalled();
  });
});
