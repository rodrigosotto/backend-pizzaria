import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    if (dto.userId) {
      await this.assertEligibleUser(pizzeriaId, dto.userId);

      const existing = await this.prisma.db.deliverer.findUnique({
        where: {
          pizzeriaId_userId: { pizzeriaId, userId: dto.userId },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'Este usuário já possui perfil de entregador nesta pizzaria',
        );
      }
    }

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
    if (dto.userId !== undefined) {
      await this.assertEligibleUser(pizzeriaId, dto.userId);

      const existing = await this.prisma.db.deliverer.findFirst({
        where: { pizzeriaId, userId: dto.userId, id: { not: id } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'Este usuário já possui perfil de entregador nesta pizzaria',
        );
      }
    }

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

  private async assertEligibleUser(pizzeriaId: string, userId: string) {
    const membership = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId, pizzeriaId } },
      select: { role: true, isActive: true },
    });

    if (!membership?.isActive || membership.role !== 'entregador') {
      throw new BadRequestException(
        'O usuário selecionado não é um entregador ativo desta pizzaria',
      );
    }
  }
}
