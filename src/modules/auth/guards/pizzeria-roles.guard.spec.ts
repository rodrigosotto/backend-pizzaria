import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PizzeriaUserRole } from '@prisma/client';
import { PizzeriaRolesGuard } from './pizzeria-roles.guard';

const contextWithRole = (role?: PizzeriaUserRole) =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ pizzeriaRole: role }) }),
  }) as any;

describe('PizzeriaRolesGuard', () => {
  it('autoriza usando a role da unidade, mesmo sem consultar a role global', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([PizzeriaUserRole.cozinha]),
    } as unknown as Reflector;
    const guard = new PizzeriaRolesGuard(reflector);

    expect(guard.canActivate(contextWithRole(PizzeriaUserRole.cozinha))).toBe(true);
  });

  it('nega quando a role da unidade não está entre as permitidas', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([PizzeriaUserRole.admin]),
    } as unknown as Reflector;
    const guard = new PizzeriaRolesGuard(reflector);

    expect(() => guard.canActivate(contextWithRole(PizzeriaUserRole.atendente))).toThrow(
      ForbiddenException,
    );
  });

  it('libera endpoints sem restrição de role da unidade', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new PizzeriaRolesGuard(reflector);

    expect(guard.canActivate(contextWithRole())).toBe(true);
  });
});
