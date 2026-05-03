import { Injectable } from '@nestjs/common';
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

  private get defaultConfig() {
    return {
      acceptingOrders: true,
      estimatedDelivery: 45,
      estimatedPickup: 20,
      serviceFeePct: new Prisma.Decimal(10),
      serviceFeeAppliesTo: 'all',
      minDeliveryOrder: null,
      freeDeliveryAbove: null,
      pizzaPricingRule: 'most_expensive',
      paymentMethods: ['cash', 'pix', 'credit', 'debit'] as Prisma.InputJsonValue,
      businessHours: {} as Prisma.InputJsonValue,
      autoMessages: Prisma.DbNull,
    };
  }

  async getConfig(pizzeriaId: string) {
    // Se ainda não existe, cria com valores padrão (idempotente para novas pizzarias)
    return this.prisma.db.pizzeriaConfig.upsert({
      where: { pizzeriaId },
      update: {},
      create: { pizzeriaId, ...this.defaultConfig },
    });
  }

  async updateConfig(
    pizzeriaId: string,
    dto: UpdatePizzeriaConfigDto,
    userId: string,
  ) {
    // Garante que o registro existe antes de atualizar
    const existing = await this.getConfig(pizzeriaId);

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
