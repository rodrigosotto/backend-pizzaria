import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { Server, ServerOptions } from 'socket.io';
import { parseCorsOrigins } from '../../core/config/cors.config';

/**
 * IoAdapter compatível com Fastify.
 *
 * Cria um único Socket.io Server ligado ao servidor HTTP do Fastify e o
 * reutiliza entre todos os namespaces da aplicação.
 */
export class FastifyIoAdapter extends IoAdapter {
  private ioServer: Server | undefined;

  constructor(private readonly app: INestApplication) {
    super(app);
  }

  createIOServer(_port: number, options?: ServerOptions): Server {
    if (this.ioServer) return this.ioServer;

    this.ioServer = new Server(this.app.getHttpServer(), {
      ...options,
      cors: { origin: parseCorsOrigins() },
    });
    return this.ioServer;
  }
}
