import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PizzeriaUserRole, WhatsAppAccountStatus } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { UpsertWhatsAppAccountDto } from './dto/upsert-whatsapp-account.dto';

@Injectable()
export class WhatsAppAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async get(pizzeriaId: string) {
    return this.prisma.db.whatsAppAccount.findUnique({
      where: { pizzeriaId },
      select: {
        id: true,
        pizzeriaId: true,
        displayPhoneNumber: true,
        phoneNumberId: true,
        businessAccountId: true,
        metaAppId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async upsert(pizzeriaId: string, userId: string, dto: UpsertWhatsAppAccountDto) {
    await this.assertAdmin(pizzeriaId, userId);
    const existing = await this.prisma.db.whatsAppAccount.findFirst({
      where: { phoneNumberId: dto.phoneNumberId, NOT: { pizzeriaId } },
      select: { id: true },
    });
    if (existing) throw new ForbiddenException('Phone Number ID já está vinculado a outra unidade');

    return this.prisma.db.whatsAppAccount.upsert({
      where: { pizzeriaId },
      create: {
        pizzeriaId,
        displayPhoneNumber: this.normalizePhone(dto.displayPhoneNumber),
        phoneNumberId: dto.phoneNumberId.trim(),
        businessAccountId: dto.businessAccountId?.trim() || undefined,
        metaAppId: dto.metaAppId?.trim() || undefined,
        status: dto.status ?? WhatsAppAccountStatus.pending,
      },
      update: {
        displayPhoneNumber: this.normalizePhone(dto.displayPhoneNumber),
        phoneNumberId: dto.phoneNumberId.trim(),
        businessAccountId: dto.businessAccountId?.trim() || null,
        metaAppId: dto.metaAppId?.trim() || null,
        ...(dto.status ? { status: dto.status } : {}),
      },
      select: {
        id: true,
        pizzeriaId: true,
        displayPhoneNumber: true,
        phoneNumberId: true,
        businessAccountId: true,
        metaAppId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async setStatus(pizzeriaId: string, userId: string, status: WhatsAppAccountStatus) {
    await this.assertAdmin(pizzeriaId, userId);
    try {
      return await this.prisma.db.whatsAppAccount.update({
        where: { pizzeriaId },
        data: { status },
        select: {
          id: true,
          pizzeriaId: true,
          displayPhoneNumber: true,
          phoneNumberId: true,
          businessAccountId: true,
          metaAppId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Conta WhatsApp não encontrada');
      }
      throw error;
    }
  }

  private async assertAdmin(pizzeriaId: string, userId: string): Promise<void> {
    const link = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId, pizzeriaId } },
      select: { isActive: true, role: true },
    });
    if (!link?.isActive) throw new ForbiddenException('Sem acesso a esta unidade');
    if (link.role !== PizzeriaUserRole.admin) throw new ForbiddenException('Somente administradores podem configurar o WhatsApp');
  }

  private normalizePhone(value: string): string {
    const normalized = value.replace(/\D/g, '');
    if (normalized.length < 8 || normalized.length > 20) throw new ForbiddenException('Número WhatsApp inválido');
    return normalized;
  }
}
