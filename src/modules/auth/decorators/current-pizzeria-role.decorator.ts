import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { PizzeriaUserRole } from '@prisma/client';

/** Injeta a role validada do usuário na pizzaria indicada pelo header. */
export const CurrentPizzeriaRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PizzeriaUserRole => {
    const request = ctx.switchToHttp().getRequest();
    return request.pizzeriaRole as PizzeriaUserRole;
  },
);
