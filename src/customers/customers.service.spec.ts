import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';

describe('CustomersService - exportCsv', () => {
  let service: CustomersService;
  // Mock PrismaService with necessary methods for testing
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      db: {
        customer: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
        },
        customerAddress: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          updateMany: jest.fn(),
        },
        order: { count: jest.fn() },
        $transaction: jest.fn((cb: Function) => cb(mockPrisma.db)),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('retorna CSV com header correto', async () => {
    mockPrisma.db.customer.findMany.mockResolvedValue([]);

    const csv = await service.exportCsv('piz-1');
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Nome,Telefone,CPF,Email,Selos de Fidelidade,Bloqueado,Data de Cadastro');
  });

  it('retorna CSV com dados dos clientes', async () => {
    mockPrisma.db.customer.findMany.mockResolvedValue([
      {
        name: 'Maria Silva',
        phone: '11999990000',
        cpf: '123.456.789-00',
        email: 'maria@test.com',
        loyaltyStamps: 5,
        isBlacklisted: false,
        createdAt: new Date('2024-01-15'),
      },
    ]);

    const csv = await service.exportCsv('piz-1');
    const lines = csv.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Maria Silva');
    expect(lines[1]).toContain('11999990000');
    expect(lines[1]).toContain('2024-01-15');
    expect(lines[1]).not.toContain('Sim'); // nao bloqueado
  });

  it('escapa aspas duplas no nome', async () => {
    mockPrisma.db.customer.findMany.mockResolvedValue([
      {
        name: 'Joao "Bigode" Silva',
        phone: '11988880000',
        cpf: null,
        email: null,
        loyaltyStamps: 0,
        isBlacklisted: false,
        createdAt: new Date('2024-06-01'),
      },
    ]);

    const csv = await service.exportCsv('piz-1');
    expect(csv).toContain('"Joao ""Bigode"" Silva"');
  });

  it('retorna apenas header quando nao ha clientes', async () => {
    mockPrisma.db.customer.findMany.mockResolvedValue([]);

    const csv = await service.exportCsv('piz-1');
    const lines = csv.split('\n');

    expect(lines).toHaveLength(1);
  });

  it('marca Sim para cliente bloqueado', async () => {
    mockPrisma.db.customer.findMany.mockResolvedValue([
      {
        name: 'Bloqueado',
        phone: '11977770000',
        cpf: null,
        email: null,
        loyaltyStamps: 0,
        isBlacklisted: true,
        createdAt: new Date('2024-01-01'),
      },
    ]);

    const csv = await service.exportCsv('piz-1');
    expect(csv).toContain('Sim');
  });

  it('passa filtro search para o banco', async () => {
    mockPrisma.db.customer.findMany.mockResolvedValue([]);

    await service.exportCsv('piz-1', 'Silva');

    const call = (mockPrisma.db.customer.findMany as any).mock.calls[0][0];
    expect(call.where).toHaveProperty('OR');
  });
});
