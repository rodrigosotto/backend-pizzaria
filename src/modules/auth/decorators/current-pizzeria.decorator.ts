import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Injeta o pizzeriaId validado pelo PizzeriaContextGuard no parâmetro do método.
 *
 * @example
 * @Get('orders')
 * @RequiresPizzeria()
 * listOrders(@CurrentPizzeria() pizzeriaId: string) { ... }
 */
export const CurrentPizzeria = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.pizzeriaId as string;
  },
);
