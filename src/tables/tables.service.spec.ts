import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TablesService } from './tables.service';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';

describe('TablesService - splitEvenly', () => {
  let service: TablesService;
  let mockPrisma: any;

  const pizzeriaId = 'piz-1';
  const tableId = 'tbl-1';
  const sessionId = 'ses-1';
  const baseSession = { id: sessionId, openedAt: new Date('2024-06-01T18:00:00Z'), closedAt: null };

  beforeEach(async () => {
    mockPrisma = {
      db: {
        table: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
        tableSession: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        tableReservation: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
        order: { findMany: jest.fn() },
        orderItem: { findMany: jest.fn() },
        $transaction: jest.fn((cb: Function) => cb(mockPrisma.db)),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<TablesService>(TablesService);
  });

  it('lanca BadRequestException se persons < 2', async () => {
    await expect(service.splitEvenly(pizzeriaId, tableId, sessionId, 1))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanca NotFoundException se sessao nao encontrada', async () => {
    mockPrisma.db.tableSession.findFirst.mockResolvedValue(null);

    await expect(service.splitEvenly(pizzeriaId, tableId, sessionId, 2))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('calcula grandTotal e perPerson corretamente', async () => {
    mockPrisma.db.tableSession.findFirst.mockResolvedValue(baseSession);
    mockPrisma.db.order.findMany.mockResolvedValue([
      { id: 'ord-1', orderNumber: 1, total: { toString: () => '60.00', valueOf: () => 60 } },
      { id: 'ord-2', orderNumber: 2, total: { toString: () => '40.00', valueOf: () => 40 } },
    ]);

    // Mock Number() conversion
    const result = await service.splitEvenly(pizzeriaId, tableId, sessionId, 2);

    expect(result.grandTotal).toBeCloseTo(100, 1);
    expect(result.persons).toBe(2);
  });

  it('retorna lista de pedidos da sessao', async () => {
    mockPrisma.db.tableSession.findFirst.mockResolvedValue(baseSession);
    mockPrisma.db.order.findMany.mockResolvedValue([
      { id: 'ord-1', orderNumber: 42, total: 50 },
    ]);

    const result = await service.splitEvenly(pizzeriaId, tableId, sessionId, 2);

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].orderNumber).toBe(42);
  });
});

describe('TablesService - splitByItems', () => {
  let service: TablesService;
  let mockPrisma: any;

  const pizzeriaId = 'piz-1';
  const tableId = 'tbl-1';
  const sessionId = 'ses-1';
  const baseSession = { id: sessionId, openedAt: new Date(), closedAt: null };

  beforeEach(async () => {
    mockPrisma = {
      db: {
        table: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
        tableSession: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        tableReservation: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
        order: { findMany: jest.fn() },
        orderItem: { findMany: jest.fn() },
        $transaction: jest.fn((cb: Function) => cb(mockPrisma.db)),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<TablesService>(TablesService);
  });

  it('lanca BadRequestException se menos de 2 pessoas', async () => {
    mockPrisma.db.tableSession.findFirst.mockResolvedValue(baseSession);
    mockPrisma.db.orderItem.findMany.mockResolvedValue([]);

    await expect(
      service.splitByItems(pizzeriaId, tableId, sessionId, [
        { label: 'Pessoa 1', orderItemIds: ['item-1'] },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanca BadRequestException se item nao pertence a sessao', async () => {
    mockPrisma.db.tableSession.findFirst.mockResolvedValue(baseSession);
    mockPrisma.db.orderItem.findMany.mockResolvedValue([
      { id: 'item-A', subtotal: 20 },
    ]);

    await expect(
      service.splitByItems(pizzeriaId, tableId, sessionId, [
        { label: 'Pessoa 1', orderItemIds: ['item-INVALIDO'] },
        { label: 'Pessoa 2', orderItemIds: ['item-A'] },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calcula subtotal por pessoa corretamente', async () => {
    mockPrisma.db.tableSession.findFirst.mockResolvedValue(baseSession);
    mockPrisma.db.orderItem.findMany.mockResolvedValue([
      { id: 'item-1', subtotal: 30 },
      { id: 'item-2', subtotal: 50 },
    ]);

    const result = await service.splitByItems(pizzeriaId, tableId, sessionId, [
      { label: 'Pessoa 1', orderItemIds: ['item-1'] },
      { label: 'Pessoa 2', orderItemIds: ['item-2'] },
    ]);

    expect(result.persons[0].subtotal).toBe(30);
    expect(result.persons[1].subtotal).toBe(50);
    expect(result.totalAssigned).toBe(80);
  });

  it('retorna breakdown com label correto', async () => {
    mockPrisma.db.tableSession.findFirst.mockResolvedValue(baseSession);
    mockPrisma.db.orderItem.findMany.mockResolvedValue([
      { id: 'item-1', subtotal: 25 },
      { id: 'item-2', subtotal: 25 },
    ]);

    const result = await service.splitByItems(pizzeriaId, tableId, sessionId, [
      { label: 'Alice', orderItemIds: ['item-1'] },
      { label: 'Bob', orderItemIds: ['item-2'] },
    ]);

    expect(result.persons[0].label).toBe('Alice');
    expect(result.persons[1].label).toBe('Bob');
  });
});
