import { SetMetadata } from '@nestjs/common';
import { PizzeriaUserRole } from '@prisma/client';

export const PIZZERIA_ROLES_KEY = 'pizzeria_roles';

/** Restringe uma rota multi-tenant pelas roles do vínculo com a pizzaria ativa. */
export const PizzeriaRoles = (...roles: PizzeriaUserRole[]) =>
  SetMetadata(PIZZERIA_ROLES_KEY, roles);
