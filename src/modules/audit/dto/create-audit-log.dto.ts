export class CreateAuditLogDto {
  pizzeriaId?: string;
  userId?: string;
  action!: string;
  entity!: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}
