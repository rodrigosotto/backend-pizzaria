import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      await this.prisma.db.auditLog.create({
        data: {
          pizzeriaId: dto.pizzeriaId,
          userId: dto.userId,
          action: dto.action,
          entity: dto.entity,
          entityId: dto.entityId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          before: (dto.before as any) ?? undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          after: (dto.after as any) ?? undefined,
          ip: dto.ip,
        },
      });
    } catch (err) {
      // Auditoria nunca deve derrubar a operação principal
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }
}
