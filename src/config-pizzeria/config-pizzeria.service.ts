import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { UpdatePizzeriaConfigDto } from './dto/update-pizzeria-config.dto';

@Injectable()
export class ConfigPizzeriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getConfig(pizzeriaId: string) {
    const config = await this.prisma.db.pizzeriaConfig.findUnique({
      where: { pizzeriaId },
    });

    if (!config) {
      throw new NotFoundException('Configuração não encontrada para esta pizzaria');
    }

    return config;
  }

  async updateConfig(
    pizzeriaId: string,
    dto: UpdatePizzeriaConfigDto,
    userId: string,
  ) {
    const existing = await this.prisma.db.pizzeriaConfig.findUnique({
      where: { pizzeriaId },
    });

    if (!existing) {
      throw new NotFoundException('Configuração não encontrada para esta pizzaria');
    }

    const updated = await this.prisma.db.pizzeriaConfig.update({
      where: { pizzeriaId },
      data: {
        ...(dto.acceptingOrders !== undefined && { acceptingOrders: dto.acceptingOrders }),
        ...(dto.estimatedDelivery !== undefined && { estimatedDelivery: dto.estimatedDelivery }),
        ...(dto.estimatedPickup !== undefined && { estimatedPickup: dto.estimatedPickup }),
        ...(dto.serviceFeePct !== undefined && { serviceFeePct: dto.serviceFeePct }),
        ...(dto.serviceFeeAppliesTo !== undefined && { serviceFeeAppliesTo: dto.serviceFeeAppliesTo }),
        ...(dto.minDeliveryOrder !== undefined && { minDeliveryOrder: dto.minDeliveryOrder }),
        ...(dto.freeDeliveryAbove !== undefined && { freeDeliveryAbove: dto.freeDeliveryAbove }),
        ...(dto.pizzaPricingRule !== undefined && { pizzaPricingRule: dto.pizzaPricingRule }),
        ...(dto.paymentMethods !== undefined && { paymentMethods: dto.paymentMethods as Prisma.InputJsonValue }),
        ...(dto.businessHours !== undefined && { businessHours: dto.businessHours as Prisma.InputJsonValue }),
        ...(dto.autoMessages !== undefined && { autoMessages: dto.autoMessages as Prisma.InputJsonValue }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'PizzeriaConfig',
      entityId: existing.id,
      after: dto as Record<string, unknown>,
    });

    return updated;
  }
}
