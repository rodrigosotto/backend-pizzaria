import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

export interface JwtPayload {
  sub: string;
  email: string;
}

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  cpf: true,
  email: true,
  loyaltyStamps: true,
  isBlacklisted: true,
  createdAt: true,
  addresses: {
    orderBy: { isDefault: 'desc' as const },
  },
} as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Customers ─────────────────────────────────────────────────────────────

  async list(pizzeriaId: string, search?: string) {
    return this.prisma.db.customer.findMany({
      where: {
        pizzeriaId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { cpf: { contains: search } },
              ],
            }
          : {}),
      },
      select: CUSTOMER_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async findById(pizzeriaId: string, customerId: string) {
    const customer = await this.prisma.db.customer.findFirst({
      where: { id: customerId, pizzeriaId },
      select: {
        ...CUSTOMER_SELECT,
        orders: {
          select: {
            id: true,
            type: true,
            status: true,
            total: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado');
    return customer;
  }

  async findByPhone(pizzeriaId: string, phone: string) {
    const customer = await this.prisma.db.customer.findUnique({
      where: { pizzeriaId_phone: { pizzeriaId, phone } },
      select: CUSTOMER_SELECT,
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado');
    return customer;
  }

  async create(pizzeriaId: string, dto: CreateCustomerDto, user: JwtPayload) {
    const existing = await this.prisma.db.customer.findUnique({
      where: { pizzeriaId_phone: { pizzeriaId, phone: dto.phone } },
    });
    if (existing) throw new ConflictException('Ja existe um cliente com este telefone');

    const customer = await this.prisma.db.customer.create({
      data: {
        pizzeriaId,
        name: dto.name,
        phone: dto.phone,
        cpf: dto.cpf,
        email: dto.email,
      },
      select: CUSTOMER_SELECT,
    });

    await this.audit.log({
      pizzeriaId,
      userId: user.sub,
      action: 'CUSTOMER_CREATED',
      entity: 'Customer',
      entityId: customer.id,
      after: { id: customer.id, name: customer.name, phone: customer.phone } as Record<string, unknown>,
    });

    return customer;
  }

  async update(pizzeriaId: string, customerId: string, dto: UpdateCustomerDto, user: JwtPayload) {
    const customer = await this.findOrFail(pizzeriaId, customerId);

    if (dto.phone && dto.phone !== customer.phone) {
      const conflict = await this.prisma.db.customer.findUnique({
        where: { pizzeriaId_phone: { pizzeriaId, phone: dto.phone } },
      });
      if (conflict) throw new ConflictException('Ja existe um cliente com este telefone');
    }

    const updated = await this.prisma.db.customer.update({
      where: { id: customerId },
      data: {
        name: dto.name,
        phone: dto.phone,
        cpf: dto.cpf,
        email: dto.email,
        isBlacklisted: dto.isBlacklisted,
        loyaltyStamps: dto.loyaltyStamps,
      },
      select: CUSTOMER_SELECT,
    });

    await this.audit.log({
      pizzeriaId,
      userId: user.sub,
      action: 'CUSTOMER_UPDATED',
      entity: 'Customer',
      entityId: customerId,
      before: { name: customer.name, phone: customer.phone, isBlacklisted: customer.isBlacklisted } as Record<string, unknown>,
      after: { name: updated.name, phone: updated.phone, isBlacklisted: updated.isBlacklisted } as Record<string, unknown>,
    });

    return updated;
  }

  async remove(pizzeriaId: string, customerId: string, user: JwtPayload) {
    const customer = await this.findOrFail(pizzeriaId, customerId);

    const orderCount = await this.prisma.db.order.count({ where: { customerId } });
    if (orderCount > 0) {
      throw new ConflictException('Cliente possui pedidos vinculados — use isBlacklisted para bloquear');
    }

    await this.prisma.db.customer.delete({ where: { id: customerId } });

    await this.audit.log({
      pizzeriaId,
      userId: user.sub,
      action: 'CUSTOMER_DELETED',
      entity: 'Customer',
      entityId: customerId,
      before: { name: customer.name, phone: customer.phone } as Record<string, unknown>,
    });

    return { message: 'Cliente removido com sucesso' };
  }

  private async findOrFail(pizzeriaId: string, customerId: string) {
    const customer = await this.prisma.db.customer.findFirst({
      where: { id: customerId, pizzeriaId },
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado');
    return customer;
  }

  // ── Addresses ─────────────────────────────────────────────────────────────

  async listAddresses(pizzeriaId: string, customerId: string) {
    await this.findOrFail(pizzeriaId, customerId);
    return this.prisma.db.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
  }

  async createAddress(pizzeriaId: string, customerId: string, dto: CreateAddressDto, user: JwtPayload) {
    await this.findOrFail(pizzeriaId, customerId);

    return this.prisma.db.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const address = await tx.customerAddress.create({
        data: {
          customerId,
          label: dto.label,
          street: dto.street,
          number: dto.number,
          complement: dto.complement,
          neighborhood: dto.neighborhood,
          city: dto.city,
          zipCode: dto.zipCode,
          isDefault: dto.isDefault ?? false,
        },
      });

      await this.audit.log({
        pizzeriaId,
        userId: user.sub,
        action: 'CUSTOMER_ADDRESS_CREATED',
        entity: 'CustomerAddress',
        entityId: address.id,
        after: address as unknown as Record<string, unknown>,
      });

      return address;
    });
  }

  async updateAddress(
    pizzeriaId: string,
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
    user: JwtPayload,
  ) {
    await this.findOrFail(pizzeriaId, customerId);
    const address = await this.findAddressOrFail(customerId, addressId);

    return this.prisma.db.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const updated = await tx.customerAddress.update({
        where: { id: addressId },
        data: {
          label: dto.label,
          street: dto.street,
          number: dto.number,
          complement: dto.complement,
          neighborhood: dto.neighborhood,
          city: dto.city,
          zipCode: dto.zipCode,
          isDefault: dto.isDefault,
        },
      });

      await this.audit.log({
        pizzeriaId,
        userId: user.sub,
        action: 'CUSTOMER_ADDRESS_UPDATED',
        entity: 'CustomerAddress',
        entityId: addressId,
        before: address as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
      });

      return updated;
    });
  }

  async removeAddress(pizzeriaId: string, customerId: string, addressId: string, user: JwtPayload) {
    await this.findOrFail(pizzeriaId, customerId);
    const address = await this.findAddressOrFail(customerId, addressId);

    await this.prisma.db.customerAddress.delete({ where: { id: addressId } });

    await this.audit.log({
      pizzeriaId,
      userId: user.sub,
      action: 'CUSTOMER_ADDRESS_DELETED',
      entity: 'CustomerAddress',
      entityId: addressId,
      before: address as unknown as Record<string, unknown>,
    });

    return { message: 'Endereco removido com sucesso' };
  }

  private async findAddressOrFail(customerId: string, addressId: string) {
    const address = await this.prisma.db.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });
    if (!address) throw new NotFoundException('Endereco nao encontrado');
    return address;
  }

  // RF55 — Exportação CSV de clientes
  async exportCsv(pizzeriaId: string, search?: string): Promise<string> {
    const customers = await this.prisma.db.customer.findMany({
      where: {
        pizzeriaId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { cpf: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        name: true,
        phone: true,
        cpf: true,
        email: true,
        loyaltyStamps: true,
        isBlacklisted: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const header = 'Nome,Telefone,CPF,Email,Selos de Fidelidade,Bloqueado,Data de Cadastro';
    const rows = customers.map((c) =>
      [
        `"${c.name.replace(/"/g, '""')}"`,
        c.phone,
        c.cpf ?? '',
        c.email ?? '',
        c.loyaltyStamps,
        c.isBlacklisted ? 'Sim' : 'Não',
        c.createdAt.toISOString().split('T')[0],
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }
}
