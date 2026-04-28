import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SyncUserDto } from './dto/sync-user.dto';
import { SupabaseJwtService } from './supabase-jwt.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseJwt: SupabaseJwtService,
    private readonly audit: AuditService,
  ) {}

  // ── Sync ────────────────────────────────────────────────────────────────────
  // Chamado após confirmação de e-mail ou no primeiro login via Supabase Auth.
  // Cria o usuário no banco caso ainda não exista; retorna os dados existentes
  // se o usuário já foi sincronizado anteriormente.

  async syncUser(token: string | undefined, dto: SyncUserDto) {
    if (!token) throw new UnauthorizedException('Token não fornecido');

    let payload: { sub: string; email: string };
    try {
      payload = await this.supabaseJwt.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const user = await this.prisma.db.user.upsert({
      where: { id: payload.sub },
      create: {
        id: payload.sub,
        email: payload.email,
        name: dto.name,
        phone: dto.phone,
        role: UserRole.owner,
      },
      update: {},
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.audit.log({
      action: 'USER_SYNCED',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
    });

    return { user };
  }

  // ── Me ──────────────────────────────────────────────────────────────────────

  async me(userId: string) {
    return this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        pizzeriaRoles: {
          where: { isActive: true },
          select: {
            role: true,
            pizzeria: {
              select: { id: true, tradeName: true, logoUrl: true, status: true },
            },
          },
        },
      },
    });
  }
}
