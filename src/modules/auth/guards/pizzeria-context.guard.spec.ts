import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PizzeriaUserRole } from '@prisma/client';
import { PizzeriaContextGuard } from './pizzeria-context.guard';

const contextFor = (request: Record<string, unknown>) =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  }) as any;

describe('PizzeriaContextGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => key === 'requiresPizzeria'),
  } as unknown as Reflector;

  it('injeta no request a role do vínculo ativo da unidade selecionada', async () => {
    const request = {
      headers: { 'x-pizzeria-id': 'pizzeria-1' },
      user: { sub: 'user-1', role: 'owner' },
    } as Record<string, any>;
    const prisma = {
      db: {
        userPizzeriaRole: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            role: PizzeriaUserRole.cozinha,
          }),
        },
      },
    } as any;
    const guard = new PizzeriaContextGuard(reflector, prisma);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.pizzeriaId).toBe('pizzeria-1');
    expect(request.pizzeriaRole).toBe(PizzeriaUserRole.cozinha);
    expect(prisma.db.userPizzeriaRole.findUnique).toHaveBeenCalledWith({
      where: {
        userId_pizzeriaId: { userId: 'user-1', pizzeriaId: 'pizzeria-1' },
      },
      select: { isActive: true, role: true },
    });
  });

  it('nega vínculo inativo ou ausente', async () => {
    const prisma = {
      db: {
        userPizzeriaRole: {
          findUnique: jest.fn().mockResolvedValue({
            isActive: false,
            role: PizzeriaUserRole.admin,
          }),
        },
      },
    } as any;
    const guard = new PizzeriaContextGuard(reflector, prisma);

    await expect(
      guard.canActivate(
        contextFor({
          headers: { 'x-pizzeria-id': 'pizzeria-2' },
          user: { sub: 'user-1' },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
