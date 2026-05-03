import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreatePrinterDto } from './dto/create-printer.dto';
import { UpdatePrinterDto } from './dto/update-printer.dto';

@Injectable()
export class PrintersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(pizzeriaId: string, onlyActive?: boolean) {
    return this.prisma.db.printer.findMany({
      where: {
        pizzeriaId,
        ...(onlyActive === true && { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(pizzeriaId: string, id: string) {
    const printer = await this.prisma.db.printer.findFirst({
      where: { id, pizzeriaId },
    });

    if (!printer) throw new NotFoundException('Impressora não encontrada');
    return printer;
  }

  async create(pizzeriaId: string, dto: CreatePrinterDto, userId: string) {
    const printer = await this.prisma.db.printer.create({
      data: {
        pizzeriaId,
        name: dto.name,
        ip: dto.ip,
        sector: dto.sector,
        model: dto.model,
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'Printer',
      entityId: printer.id,
      after: { name: printer.name, ip: printer.ip, sector: printer.sector },
    });

    return printer;
  }

  async update(
    pizzeriaId: string,
    id: string,
    dto: UpdatePrinterDto,
    userId: string,
  ) {
    await this.findById(pizzeriaId, id);

    const updated = await this.prisma.db.printer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.ip !== undefined && { ip: dto.ip }),
        ...(dto.sector !== undefined && { sector: dto.sector }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'Printer',
      entityId: id,
      after: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(pizzeriaId: string, id: string, userId: string) {
    const printer = await this.findById(pizzeriaId, id);

    await this.prisma.db.printer.delete({ where: { id } });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'DELETE',
      entity: 'Printer',
      entityId: id,
      before: { name: printer.name },
    });
  }
}
