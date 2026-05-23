import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../infra/database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SupabaseJwtService } from '../supabase-jwt.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly supabaseJwt: SupabaseJwtService,
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Token não fornecido');

    let payload: { sub: string; email: string; role?: string };

    if (this.isLocalToken(token)) {
      try {
        payload = this.jwtService.verify<{ sub: string; email: string; role: string }>(token, {
          secret: process.env.JWT_SECRET,
          issuer: 'pizzaria-backend',
        });
      } catch {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    } else {
      try {
        payload = await this.supabaseJwt.verifyToken(token);
      } catch {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    }

    const user = await this.prisma.db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado — chame POST /auth/sync primeiro');
    if (!user.isActive) throw new UnauthorizedException('Conta desativada');

    request.user = { sub: user.id, email: user.email, role: user.role };
    return true;
  }

  private isLocalToken(token: string): boolean {
    try {
      const [, payloadB64] = token.split('.');
      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
        iss?: string;
      };
      return decoded.iss === 'pizzaria-backend';
    } catch {
      return false;
    }
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
