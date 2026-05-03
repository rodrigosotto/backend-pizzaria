import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateLoyaltyDto } from './dto/create-loyalty.dto';
import { UpdateLoyaltyDto } from './dto/update-loyalty.dto';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(pizzeriaId: string) {
    return this.prisma.db.loyaltyProgram.findMany({
      where: { pizzeriaId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(pizzeriaId: string, id: string) {
    const program = await this.prisma.db.loyaltyProgram.findFirst({
      where: { id, pizzeriaId },
    });

    if (!program) throw new NotFoundException('Programa de fidelidade não encontrado');
    return program;
  }

  async create(pizzeriaId: string, dto: CreateLoyaltyDto, userId: string) {
    const existing = await this.prisma.db.loyaltyProgram.findFirst({
      where: { pizzeriaId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Já existe um programa com o nome "${dto.name}"`);
    }

    const program = await this.prisma.db.loyaltyProgram.create({
      data: {
        pizzeriaId,
        name: dto.name,
        stampsGoal: dto.stampsGoal,
        reward: dto.reward,
        validityDays: dto.validityDays,
        isActive: dto.isActive ?? true,
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'LoyaltyProgram',
      entityId: program.id,
      after: { name: program.name, stampsGoal: program.stampsGoal },
    });

    return program;
  }

  async update(pizzeriaId: string, id: string, dto: UpdateLoyaltyDto, userId: string) {
    await this.findById(pizzeriaId, id);

    if (dto.name) {
      const conflict = await this.prisma.db.loyaltyProgram.findFirst({
        where: { pizzeriaId, name: dto.name, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Já existe um programa com o nome "${dto.name}"`);
      }
    }

    const updated = await this.prisma.db.loyaltyProgram.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.stampsGoal !== undefined && { stampsGoal: dto.stampsGoal }),
        ...(dto.reward !== undefined && { reward: dto.reward }),
        ...(dto.validityDays !== undefined && { validityDays: dto.validityDays }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'LoyaltyProgram',
      entityId: id,
      after: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(pizzeriaId: string, id: string, userId: string) {
    const program = await this.findById(pizzeriaId, id);

    await this.prisma.db.loyaltyProgram.delete({ where: { id } });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'DELETE',
      entity: 'LoyaltyProgram',
      entityId: id,
      before: { name: program.name },
    });
  }
}
