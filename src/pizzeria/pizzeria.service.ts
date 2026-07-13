import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PizzeriaUserRole, UserRole } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { SupabaseStorageService } from '../infra/supabase/supabase-storage.service';
import { CreatePizzeriaDto } from './dto/create-pizzeria.dto';
import { UpdatePizzeriaDto } from './dto/update-pizzeria.dto';
import { RegisterPizzeriaUserDto } from './dto/register-pizzeria-user.dto';
import { UpdatePizzeriaUserDto } from './dto/update-pizzeria-user.dto';
import * as path from 'path';

const PIZZERIA_SELECT = {
  id: true,
  tradeName: true,
  companyName: true,
  cnpj: true,
  phone: true,
  email: true,
  logoUrl: true,
  address: true,
  status: true,
  plan: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class PizzeriaService {
  private readonly logger = new Logger(PizzeriaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: SupabaseStorageService,
  ) {}

  //id usuario autenticado no jwt, ao cadastrar a pizzaria é vinculado ao usuario,
  // //apenas o dono pode editar ou excluir a pizzaria,
  // o dono pode convidar outros usuarios para colaborar na pizzaria com diferentes
  // roles (admin, atendente, cozinha), os colaboradores
  // podem ser removidos ou ter seus roles alterados pelo dono,
  // a pizzaria tem um status (active, inactive) e apenas as pizzarias
  // ativas são listadas para o usuario, ao excluir a pizzaria ela é apenas desativada
  // (status = inactive) para manter o histórico de dados relacionados,
  //  a pizzaria tem um logo que pode ser enviado e armazenado
  //  usando o Supabase Storage, as informações de endereço são armazenadas
  // como JSON para flexibilidade, todas as ações relevantes são auditadas usando o AuditService.
  async create(dto: CreatePizzeriaDto, user: JwtPayload) {
    if (dto.cnpj) {
      const existing = await this.prisma.db.pizzeria.findUnique({
        where: { cnpj: dto.cnpj },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'Já existe uma pizzaria cadastrada com este CNPJ',
        );
      }
    }

    const nameExists = await this.prisma.db.pizzeria.findFirst({
      where: {
        ownerId: user.sub,
        tradeName: dto.tradeName,
        status: { not: 'inactive' },
      },
      select: { id: true },
    });
    if (nameExists) {
      throw new ConflictException(
        'Você já possui uma pizzaria cadastrada com este nome',
      );
    }

    const pizzeria = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.pizzeria.create({
        data: {
          ownerId: user.sub,
          tradeName: dto.tradeName,
          companyName: dto.companyName,
          cnpj: dto.cnpj,
          phone: dto.phone,
          email: dto.email,
          address: dto.address as Prisma.InputJsonValue,
        },
        select: PIZZERIA_SELECT,
      });

      await tx.userPizzeriaRole.create({
        data: {
          userId: user.sub,
          pizzeriaId: created.id,
          role: PizzeriaUserRole.admin,
        },
      });

      return created;
    });

    await this.audit.log({
      action: 'PIZZERIA_CREATED',
      entity: 'Pizzeria',
      entityId: pizzeria.id,
      userId: user.sub,
      after: pizzeria as Record<string, unknown>,
    });

    return pizzeria;
  }

  findAll(userId: string) {
    return this.prisma.db.pizzeria.findMany({
      where: { ownerId: userId, status: { not: 'inactive' } },
      select: {
        ...PIZZERIA_SELECT,
        _count: { select: { userRoles: { where: { isActive: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(pizzeriaId: string, user: JwtPayload) {
    await this.assertAccess(pizzeriaId, user.sub);

    const pizzeria = await this.prisma.db.pizzeria.findUnique({
      where: { id: pizzeriaId },
      select: {
        ...PIZZERIA_SELECT,
        _count: { select: { userRoles: { where: { isActive: true } } } },
        config: true,
      },
    });

    if (!pizzeria) throw new NotFoundException('Pizzaria não encontrada');
    return pizzeria;
  }

  async update(pizzeriaId: string, dto: UpdatePizzeriaDto, user: JwtPayload) {
    await this.assertAccess(pizzeriaId, user.sub, [PizzeriaUserRole.admin]);

    const before = await this.prisma.db.pizzeria.findUnique({
      where: { id: pizzeriaId },
      select: PIZZERIA_SELECT,
    });

    if (!before) throw new NotFoundException('Pizzaria não encontrada');

    const updated = await this.prisma.db.pizzeria.update({
      where: { id: pizzeriaId },
      data: {
        ...dto,
        address: dto.address
          ? (dto.address as Prisma.InputJsonValue)
          : undefined,
      },
      select: PIZZERIA_SELECT,
    });

    await this.audit.log({
      action: 'PIZZERIA_UPDATED',
      entity: 'Pizzeria',
      entityId: pizzeriaId,
      userId: user.sub,
      pizzeriaId,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });

    return updated;
  }

  async remove(pizzeriaId: string, user: JwtPayload) {
    const pizzeria = await this.prisma.db.pizzeria.findUnique({
      where: { id: pizzeriaId },
      select: { ownerId: true },
    });

    if (!pizzeria) throw new NotFoundException('Pizzaria não encontrada');
    if (pizzeria.ownerId !== user.sub) {
      throw new ForbiddenException(
        'Apenas o proprietário pode excluir a pizzaria',
      );
    }

    await this.prisma.db.pizzeria.update({
      where: { id: pizzeriaId },
      data: { status: 'inactive' },
    });

    await this.audit.log({
      action: 'PIZZERIA_DELETED',
      entity: 'Pizzeria',
      entityId: pizzeriaId,
      userId: user.sub,
      pizzeriaId,
    });

    return { message: 'Pizzaria desativada com sucesso' };
  }

  async uploadLogo(
    pizzeriaId: string,
    file: Buffer,
    originalName: string,
    mimeType: string,
    user: JwtPayload,
  ) {
    await this.assertAccess(pizzeriaId, user.sub, [PizzeriaUserRole.admin]);

    const ext = path.extname(originalName) || '.jpg';
    const storagePath = `${pizzeriaId}/logo${ext}`;

    const publicUrl = await this.storage.uploadFile(
      'pizzeria-logos',
      storagePath,
      file,
      mimeType,
    );

    await this.prisma.db.pizzeria.update({
      where: { id: pizzeriaId },
      data: { logoUrl: publicUrl },
    });

    await this.audit.log({
      action: 'PIZZERIA_LOGO_UPDATED',
      entity: 'Pizzeria',
      entityId: pizzeriaId,
      userId: user.sub,
      pizzeriaId,
      after: { logoUrl: publicUrl } as Record<string, unknown>,
    });

    return { logoUrl: publicUrl };
  }

  async findUsers(pizzeriaId: string, user: JwtPayload) {
    await this.assertAccess(pizzeriaId, user.sub, [PizzeriaUserRole.admin]);

    return this.prisma.db.userPizzeriaRole.findMany({
      where: { pizzeriaId, isActive: true },
      select: {
        id: true,
        role: true,
        invitedAt: true,
        acceptedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { invitedAt: 'asc' },
    });
  }

  async registerUser(
    pizzeriaId: string,
    dto: RegisterPizzeriaUserDto,
    user: JwtPayload,
  ) {
    await this.assertAccess(pizzeriaId, user.sub, [PizzeriaUserRole.admin]);

    let target = await this.prisma.db.user.findUnique({
      where: { email: dto.email },
      select: { id: true, name: true, email: true, phone: true },
    });

    if (!target) {
      // User doesn't exist — create via stored procedure register_auth_user()
      // which inserts into auth.users + auth.identities (Supabase Auth).
      // The trigger handle_new_user() auto-creates the public.users entry.
      const result = await this.prisma.db.$queryRaw<
        { register_auth_user: string }[]
      >`
        SELECT public.register_auth_user(
          ${dto.email},
          ${dto.password},
          ${dto.name},
          ${dto.phone ?? null},
          ${dto.role}
        ) AS register_auth_user
      `;

      const newUserId = result[0]?.register_auth_user;
      if (!newUserId) {
        throw new InternalServerErrorException(
          'Erro ao criar usuário no sistema de autenticação',
        );
      }

      // The trigger created the public.users row; update it to ensure correct role
      target = await this.prisma.db.user.update({
        where: { id: newUserId },
        data: {
          role: UserRole[dto.role] ?? UserRole.atendente,
        },
        select: { id: true, name: true, email: true, phone: true },
      });

      await this.audit.log({
        action: 'USER_REGISTERED',
        entity: 'User',
        entityId: target.id,
        userId: user.sub,
        pizzeriaId,
        after: {
          name: dto.name,
          email: dto.email,
          role: dto.role,
        } as Record<string, unknown>,
      });
    }

    // Check for existing active link
    const existing = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId: target.id, pizzeriaId } },
    });

    if (existing?.isActive) {
      throw new ConflictException(
        'Este usuário já tem um vínculo ativo nesta pizzaria',
      );
    }

    const membershipUpsert = this.prisma.db.userPizzeriaRole.upsert({
      where: { userId_pizzeriaId: { userId: target.id, pizzeriaId } },
      update: { role: dto.role, isActive: true },
      create: { userId: target.id, pizzeriaId, role: dto.role },
      select: {
        id: true,
        role: true,
        invitedAt: true,
        acceptedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });

    let role: Awaited<typeof membershipUpsert>;
    if (dto.role === PizzeriaUserRole.entregador) {
      const phone = dto.phone ?? target.phone;
      if (!phone) {
        throw new BadRequestException(
          'Telefone é obrigatório para cadastrar um entregador',
        );
      }

      [role] = await this.prisma.db.$transaction([
        membershipUpsert,
        this.prisma.db.deliverer.upsert({
          where: {
            pizzeriaId_userId: { pizzeriaId, userId: target.id },
          },
          update: {
            name: target.name,
            phone,
            isActive: true,
          },
          create: {
            pizzeriaId,
            userId: target.id,
            name: target.name,
            phone,
          },
        }),
      ]);
    } else {
      role = await membershipUpsert;
    }

    await this.audit.log({
      action: 'USER_INVITED',
      entity: 'UserPizzeriaRole',
      entityId: role.id,
      userId: user.sub,
      pizzeriaId,
      after: { targetUserId: target.id, role: dto.role } as Record<
        string,
        unknown
      >,
    });

    return role;
  }

  async updateUserRole(
    pizzeriaId: string,
    targetUserId: string,
    dto: UpdatePizzeriaUserDto,
    user: JwtPayload,
  ) {
    await this.assertAccess(pizzeriaId, user.sub, [PizzeriaUserRole.admin]);

    if (targetUserId === user.sub) {
      throw new ForbiddenException('Não é possível alterar o próprio role');
    }

    const link = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId: targetUserId, pizzeriaId } },
      select: {
        id: true,
        role: true,
        isActive: true,
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!link || !link.isActive)
      throw new NotFoundException('Vínculo não encontrado');

    const before = { role: link.role };

    const membershipUpdate = this.prisma.db.userPizzeriaRole.update({
      where: { userId_pizzeriaId: { userId: targetUserId, pizzeriaId } },
      data: { role: dto.role },
      select: {
        id: true,
        role: true,
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    let updated: Awaited<typeof membershipUpdate>;
    if (dto.role === PizzeriaUserRole.entregador) {
      if (!link.user.phone) {
        throw new BadRequestException(
          'O usuário precisa ter telefone para assumir a função de entregador',
        );
      }

      [updated] = await this.prisma.db.$transaction([
        membershipUpdate,
        this.prisma.db.deliverer.upsert({
          where: {
            pizzeriaId_userId: { pizzeriaId, userId: targetUserId },
          },
          update: {
            name: link.user.name,
            phone: link.user.phone,
            isActive: true,
          },
          create: {
            pizzeriaId,
            userId: targetUserId,
            name: link.user.name,
            phone: link.user.phone,
          },
        }),
      ]);
    } else {
      [updated] = await this.prisma.db.$transaction([
        membershipUpdate,
        this.prisma.db.deliverer.updateMany({
          where: { pizzeriaId, userId: targetUserId, isActive: true },
          data: { isActive: false },
        }),
      ]);
    }

    await this.audit.log({
      action: 'PIZZERIA_USER_ROLE_UPDATED',
      entity: 'UserPizzeriaRole',
      entityId: updated.id,
      userId: user.sub,
      pizzeriaId,
      before: before as Record<string, unknown>,
      after: { role: dto.role } as Record<string, unknown>,
    });

    return updated;
  }

  async removeUser(pizzeriaId: string, targetUserId: string, user: JwtPayload) {
    await this.assertAccess(pizzeriaId, user.sub, [PizzeriaUserRole.admin]);

    if (targetUserId === user.sub) {
      throw new ForbiddenException('Não é possível remover o próprio vínculo');
    }

    const link = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId: targetUserId, pizzeriaId } },
    });

    if (!link || !link.isActive)
      throw new NotFoundException('Vínculo não encontrado');

    await this.prisma.db.$transaction([
      this.prisma.db.userPizzeriaRole.update({
        where: { userId_pizzeriaId: { userId: targetUserId, pizzeriaId } },
        data: { isActive: false },
      }),
      this.prisma.db.deliverer.updateMany({
        where: { pizzeriaId, userId: targetUserId, isActive: true },
        data: { isActive: false },
      }),
    ]);

    await this.audit.log({
      action: 'PIZZERIA_USER_REMOVED',
      entity: 'UserPizzeriaRole',
      entityId: link.id,
      userId: user.sub,
      pizzeriaId,
      before: { targetUserId, role: link.role } as Record<string, unknown>,
    });

    return { message: 'Vínculo removido com sucesso' };
  }

  private async assertAccess(
    pizzeriaId: string,
    userId: string,
    allowedRoles?: PizzeriaUserRole[],
  ): Promise<void> {
    const link = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId, pizzeriaId } },
      select: { isActive: true, role: true },
    });

    if (!link?.isActive) {
      throw new ForbiddenException('Sem acesso a esta pizzaria');
    }

    if (allowedRoles && !allowedRoles.includes(link.role)) {
      throw new ForbiddenException('Sem permissão nesta pizzaria');
    }
  }
}
