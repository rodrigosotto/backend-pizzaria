import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PizzeriaUserRole } from '@prisma/client';
import { PIZZERIA_ROLES_KEY } from '../decorators/pizzeria-roles.decorator';

@Injectable()
export class PizzeriaRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<PizzeriaUserRole[]>(
        PIZZERIA_ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest();
    const pizzeriaRole = request.pizzeriaRole as PizzeriaUserRole | undefined;
    if (!pizzeriaRole || !requiredRoles.includes(pizzeriaRole)) {
      throw new ForbiddenException(
        'Acesso negado: permissão insuficiente nesta pizzaria',
      );
    }
    return true;
  }
}
