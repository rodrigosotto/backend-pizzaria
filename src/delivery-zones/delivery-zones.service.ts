import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

@Injectable()
export class DeliveryZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(pizzeriaId: string, onlyActive?: boolean) {
    return this.prisma.db.deliveryZone.findMany({
      where: {
        pizzeriaId,
        ...(onlyActive === true && { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(pizzeriaId: string, id: string) {
    const zone = await this.prisma.db.deliveryZone.findFirst({
      where: { id, pizzeriaId },
    });

    if (!zone) throw new NotFoundException('Zona de entrega não encontrada');
    return zone;
  }

  async create(pizzeriaId: string, dto: CreateDeliveryZoneDto, userId: string) {
    if (dto.type === 'radius' && dto.radiusKm === undefined) {
      throw new BadRequestException('radiusKm é obrigatório quando type = radius');
    }

    const zone = await this.prisma.db.deliveryZone.create({
      data: {
        pizzeriaId,
        type: dto.type,
        name: dto.name,
        fee: dto.fee,
        radiusKm: dto.radiusKm,
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'DeliveryZone',
      entityId: zone.id,
      after: { name: zone.name, type: zone.type, fee: zone.fee },
    });

    return zone;
  }

  async update(
    pizzeriaId: string,
    id: string,
    dto: UpdateDeliveryZoneDto,
    userId: string,
  ) {
    await this.findById(pizzeriaId, id);

    const updated = await this.prisma.db.deliveryZone.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.fee !== undefined && { fee: dto.fee }),
        ...(dto.radiusKm !== undefined && { radiusKm: dto.radiusKm }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'DeliveryZone',
      entityId: id,
      after: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(pizzeriaId: string, id: string, userId: string) {
    const zone = await this.findById(pizzeriaId, id);

    await this.prisma.db.deliveryZone.delete({ where: { id } });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'DELETE',
      entity: 'DeliveryZone',
      entityId: id,
      before: { name: zone.name },
    });
  }
}
