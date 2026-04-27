import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.db.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new BadRequestException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.db.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        role: UserRole.owner,
      },
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
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
    });

    return { user, token: this.signToken(user.id, user.email, user.role) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.db.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    await this.audit.log({
      action: 'USER_LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
      },
      token: this.signToken(user.id, user.email, user.role),
    };
  }

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

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.passwordHash) {
      throw new BadRequestException('Conta sem senha definida');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Senha atual incorreta');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.audit.log({
      action: 'USER_CHANGED_PASSWORD',
      entity: 'User',
      entityId: userId,
      userId,
    });

    return { message: 'Senha alterada com sucesso' };
  }

  private signToken(sub: string, email: string, role: string): string {
    const payload: JwtPayload = { sub, email, role };
    return this.jwtService.sign(payload);
  }
}
