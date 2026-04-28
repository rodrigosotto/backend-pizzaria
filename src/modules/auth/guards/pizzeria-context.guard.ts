import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../infra/database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRE_PIZZERIA_KEY } from '../decorators/require-pizzeria.decorator';

@Injectable()
export class PizzeriaContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Rotas públicas não precisam de contexto de pizzaria
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requires = this.reflector.getAllAndOverride<boolean>(REQUIRE_PIZZERIA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requires) return true;

    const request = context.switchToHttp().getRequest();
    const pizzeriaId = request.headers['x-pizzeria-id'] as string | undefined;

    if (!pizzeriaId) {
      throw new ForbiddenException(
        'Header X-Pizzeria-Id obrigatório para esta operação',
      );
    }

    // request.user já foi populado pelo JwtAuthGuard (que roda antes)
    const userId = (request.user as { sub: string })?.sub;

    const link = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId, pizzeriaId } },
      select: { isActive: true, role: true },
    });

    if (!link?.isActive) {
      throw new ForbiddenException('Sem acesso a esta pizzaria');
    }

    // Injeta no request para uso nos controllers via @CurrentPizzeria()
    request.pizzeriaId = pizzeriaId;
    request.pizzeriaRole = link.role;

    return true;
  }
}
