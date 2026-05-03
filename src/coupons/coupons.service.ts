import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(pizzeriaId: string, onlyActive?: boolean) {
    return this.prisma.db.coupon.findMany({
      where: {
        pizzeriaId,
        ...(onlyActive === true && { isActive: true }),
      },
      include: {
        _count: { select: { usages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(pizzeriaId: string, id: string) {
    const coupon = await this.prisma.db.coupon.findFirst({
      where: { id, pizzeriaId },
      include: {
        _count: { select: { usages: true } },
      },
    });

    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    return coupon;
  }

  async create(pizzeriaId: string, dto: CreateCouponDto, userId: string) {
    const existing = await this.prisma.db.coupon.findUnique({
      where: { pizzeriaId_code: { pizzeriaId, code: dto.code.toUpperCase() } },
    });

    if (existing) {
      throw new ConflictException(`Já existe um cupom com o código "${dto.code}"`);
    }

    const coupon = await this.prisma.db.coupon.create({
      data: {
        pizzeriaId,
        code: dto.code.toUpperCase(),
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderValue: dto.minOrderValue,
        maxUsesTotal: dto.maxUsesTotal,
        maxUsesPerCpf: dto.maxUsesPerCpf,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'Coupon',
      entityId: coupon.id,
      after: { code: coupon.code, discountType: coupon.discountType },
    });

    return coupon;
  }

  async update(pizzeriaId: string, id: string, dto: UpdateCouponDto, userId: string) {
    const coupon = await this.findById(pizzeriaId, id);

    if (dto.code && dto.code.toUpperCase() !== coupon.code) {
      const conflict = await this.prisma.db.coupon.findUnique({
        where: { pizzeriaId_code: { pizzeriaId, code: dto.code.toUpperCase() } },
      });
      if (conflict) {
        throw new ConflictException(`Já existe um cupom com o código "${dto.code}"`);
      }
    }

    const updated = await this.prisma.db.coupon.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.discountType !== undefined && { discountType: dto.discountType }),
        ...(dto.discountValue !== undefined && { discountValue: dto.discountValue }),
        ...(dto.minOrderValue !== undefined && { minOrderValue: dto.minOrderValue }),
        ...(dto.maxUsesTotal !== undefined && { maxUsesTotal: dto.maxUsesTotal }),
        ...(dto.maxUsesPerCpf !== undefined && { maxUsesPerCpf: dto.maxUsesPerCpf }),
        ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'Coupon',
      entityId: id,
      after: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(pizzeriaId: string, id: string, userId: string) {
    const coupon = await this.findById(pizzeriaId, id);

    await this.prisma.db.coupon.update({
      where: { id },
      data: { isActive: false },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'DELETE',
      entity: 'Coupon',
      entityId: id,
      before: { code: coupon.code },
    });
  }

  async validate(pizzeriaId: string, dto: ValidateCouponDto) {
    const coupon = await this.prisma.db.coupon.findUnique({
      where: { pizzeriaId_code: { pizzeriaId, code: dto.code.toUpperCase() } },
      include: { _count: { select: { usages: true } } },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Cupom inválido ou inativo');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Cupom expirado');
    }

    if (coupon.maxUsesTotal !== null && coupon._count.usages >= coupon.maxUsesTotal) {
      throw new BadRequestException('Cupom esgotado');
    }

    const minOrder = coupon.minOrderValue ? Number(coupon.minOrderValue) : 0;
    if (dto.orderTotal < minOrder) {
      throw new BadRequestException(
        `Pedido mínimo para este cupom: R$ ${minOrder.toFixed(2)}`,
      );
    }

    if (dto.cpf && coupon.maxUsesPerCpf !== null) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { pizzeriaId, cpf: dto.cpf },
        select: { id: true },
      });

      if (customer) {
        const cpfUses = await this.prisma.db.couponUsage.count({
          where: { couponId: coupon.id, customerId: customer.id },
        });
        if (cpfUses >= coupon.maxUsesPerCpf) {
          throw new BadRequestException('Limite de usos por CPF atingido');
        }
      }
    }

    const discountValue = Number(coupon.discountValue);
    const discount =
      coupon.discountType === 'percentage'
        ? (dto.orderTotal * discountValue) / 100
        : Math.min(discountValue, dto.orderTotal);

    return {
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue,
      discount: parseFloat(discount.toFixed(2)),
      finalTotal: parseFloat((dto.orderTotal - discount).toFixed(2)),
    };
  }
}
