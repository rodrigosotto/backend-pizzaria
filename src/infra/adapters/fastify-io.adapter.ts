import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { ServerOptions } from 'socket.io';

/**
 * IoAdapter compatível com Fastify.
 *
 * O IoAdapter padrão recebe a instância do Fastify via app.getHttpServer(), mas
 * o socket.io precisa do http.Server subjacente (fastifyInstance.server).
 * Sem esse adapter, as conexões WebSocket falham silenciosamente.
 */
export class FastifyIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplication) {
    super(app.getHttpServer().server);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, options);
  }
}
