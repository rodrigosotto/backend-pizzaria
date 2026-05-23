import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infra/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SyncUserDto } from './dto/sync-user.dto';
import { SupabaseJwtService } from './supabase-jwt.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

const REFRESH_TOKEN_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseJwt: SupabaseJwtService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  // ── Sync ────────────────────────────────────────────────────────────────────

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

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true, isActive: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokenPair(user.id, user.email, user.role);

    await this.audit.log({
      action: 'USER_LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
    });

    return tokens;
  }

  // ── Refresh Access Token ─────────────────────────────────────────────────────

  async refreshAccessToken(rawToken: string) {
    const { id, secret } = this.parseRefreshToken(rawToken);

    const record = await this.prisma.db.refreshToken.findUnique({
      where: { id },
      select: { id: true, token: true, userId: true, expiresAt: true, revokedAt: true },
    });

    if (!record) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const secretValid = await bcrypt.compare(secret, record.token);
    if (!secretValid) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Detecção de roubo: token já foi revogado mas alguém está tentando reutilizá-lo
    if (record.revokedAt !== null) {
      await this.revokeAllUserTokens(record.userId);
      await this.audit.log({
        action: 'REFRESH_TOKEN_THEFT_DETECTED',
        entity: 'RefreshToken',
        entityId: record.id,
        userId: record.userId,
      });
      throw new UnauthorizedException('Refresh token inválido — sessões encerradas por segurança');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: record.userId },
      select: { id: true, email: true, role: true },
    });

    // Rotação: revoga o token antigo e gera um novo par
    await this.prisma.db.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokenPair(user.id, user.email, user.role);
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(userId: string, rawToken: string) {
    await this.revokeRefreshToken(rawToken);
    await this.audit.log({
      action: 'USER_LOGOUT',
      entity: 'User',
      entityId: userId,
      userId,
    });
  }

  // ── Revogar token específico ─────────────────────────────────────────────────

  async revokeRefreshToken(rawToken: string) {
    const { id, secret } = this.parseRefreshToken(rawToken);

    const record = await this.prisma.db.refreshToken.findUnique({
      where: { id },
      select: { id: true, token: true, revokedAt: true },
    });

    if (!record) return;

    const secretValid = await bcrypt.compare(secret, record.token);
    if (!secretValid) return;

    if (record.revokedAt !== null) return;

    await this.prisma.db.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async generateTokenPair(userId: string, email: string, role: string) {
    const accessToken = this.jwtService.sign({ sub: userId, email, role });

    const secret = randomUUID();
    const tokenHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    const record = await this.prisma.db.refreshToken.create({
      data: { token: tokenHash, userId, expiresAt },
      select: { id: true },
    });

    // O refresh token enviado ao cliente encoda o ID (seletor) e o segredo separados por ':'
    // ID permite lookup direto no banco; o segredo é comparado contra o hash bcrypt armazenado
    const refreshToken = `${record.id}:${secret}`;

    return { accessToken, refreshToken };
  }

  private parseRefreshToken(rawToken: string): { id: string; secret: string } {
    const colonIndex = rawToken.indexOf(':');
    if (colonIndex === -1) {
      throw new BadRequestException('Formato de refresh token inválido');
    }
    return {
      id: rawToken.substring(0, colonIndex),
      secret: rawToken.substring(colonIndex + 1),
    };
  }

  private async revokeAllUserTokens(userId: string) {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
