import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateDelivererDto } from './dto/create-deliverer.dto';
import { UpdateDelivererDto } from './dto/update-deliverer.dto';

@Injectable()
export class DeliverersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(pizzeriaId: string, onlyActive?: boolean) {
    return this.prisma.db.deliverer.findMany({
      where: {
        pizzeriaId,
        ...(onlyActive === true && { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(pizzeriaId: string, id: string) {
    const deliverer = await this.prisma.db.deliverer.findFirst({
      where: { id, pizzeriaId },
    });

    if (!deliverer) throw new NotFoundException('Entregador não encontrado');
    return deliverer;
  }

  async create(pizzeriaId: string, dto: CreateDelivererDto, userId: string) {
    const deliverer = await this.prisma.db.deliverer.create({
      data: {
        pizzeriaId,
        name: dto.name,
        phone: dto.phone,
        cpf: dto.cpf,
        vehicle: dto.vehicle,
        plate: dto.plate,
        pixKey: dto.pixKey,
        userId: dto.userId,
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'Deliverer',
      entityId: deliverer.id,
      after: { name: deliverer.name, phone: deliverer.phone },
    });

    return deliverer;
  }

  async update(
    pizzeriaId: string,
    id: string,
    dto: UpdateDelivererDto,
    userId: string,
  ) {
    await this.findById(pizzeriaId, id);

    const updated = await this.prisma.db.deliverer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.cpf !== undefined && { cpf: dto.cpf }),
        ...(dto.vehicle !== undefined && { vehicle: dto.vehicle }),
        ...(dto.plate !== undefined && { plate: dto.plate }),
        ...(dto.pixKey !== undefined && { pixKey: dto.pixKey }),
        ...(dto.userId !== undefined && { userId: dto.userId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'Deliverer',
      entityId: id,
      after: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(pizzeriaId: string, id: string, userId: string) {
    const deliverer = await this.findById(pizzeriaId, id);

    await this.prisma.db.deliverer.update({
      where: { id },
      data: { isActive: false },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'DELETE',
      entity: 'Deliverer',
      entityId: id,
      before: { name: deliverer.name },
    });
  }
}
