import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/infra/database/prisma.service';

const mockPrismaService = {
  db: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
