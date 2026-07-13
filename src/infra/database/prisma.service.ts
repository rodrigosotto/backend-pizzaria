import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool!: Pool;

  /**
   * Acesse os modelos via `this.prisma.db.user`, `.order`, etc.
   */
  db!: PrismaClient;

  async onModuleInit(): Promise<void> {
    const allowSelfSignedCertificate =
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false';

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: allowSelfSignedCertificate
        ? { rejectUnauthorized: false }
        : undefined,
    });
    const adapter = new PrismaPg(this.pool);

    this.db = new PrismaClient({
      adapter,
      log: [
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    this.logger.log('PrismaService initialized (lazy connection via pg adapter)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
    await this.pool.end();
    this.logger.log('Database disconnected');
  }
}
