import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { Server, ServerOptions } from 'socket.io';

/**
 * IoAdapter compatível com Fastify.
 *
 * O IoAdapter padrão não vincula corretamente o Socket.io ao http.Server
 * subjacente do Fastify. Este adapter cria o Socket.io Server manualmente
 * vinculado ao http.Server do Fastify e cacheia a instância para
 * reutilizar entre múltiplos namespaces (orders, kds, delivery, stock).
 */
export class FastifyIoAdapter extends IoAdapter {
  private ioServer: Server | undefined;

  constructor(private readonly app: INestApplication) {
    super(app);
  }

  createIOServer(_port: number, options?: ServerOptions): Server {
    if (this.ioServer) return this.ioServer;

    const httpServer = this.app.getHttpServer();
    this.ioServer = new Server(httpServer, {
      cors: { origin: '*' },
      ...options,
    });
    return this.ioServer;
  }
}
