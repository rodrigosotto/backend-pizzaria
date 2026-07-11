import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { KdsItem } from '@prisma/client';
import { SupabaseJwtService } from '../modules/auth/supabase-jwt.service';

/**
 * Gateway WebSocket para o Kitchen Display System.
 *
 * Namespace: /kds
 *
 * Fluxo do cliente:
 *   1. Conectar com token JWT: io('/kds', { auth: { token: 'Bearer ...' } })
 *   2. Emitir `join:pizzeria` com { pizzariaId } para entrar na sala da pizzaria
 *   3. Escutar eventos emitidos pelo servidor
 *
 * Eventos emitidos pelo servidor:
 *   - kds:item:new      → novo item adicionado à fila (payload: KdsItem)
 *   - kds:item:updated  → item alterou status (payload: { itemId, status, updatedAt })
 *   - kds:queue:cleared → itens DONE foram limpos (payload: { pizzariaId, removed: number })
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/kds',
})
export class KdsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(KdsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly supabaseJwt: SupabaseJwtService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`[KDS] Client ${client.id} rejected — no token`);
      client.emit('error', { message: 'Token JWT obrigatório' });
      client.disconnect(true);
      return;
    }

    try {
      let payload: { sub: string; email: string };

      if (this.isLocalToken(token)) {
        payload = this.jwtService.verify<{ sub: string; email: string }>(token, {
          secret: process.env.JWT_SECRET,
          issuer: 'pizzaria-backend',
        });
      } else {
        payload = await this.supabaseJwt.verifyToken(token);
      }

      (client as any).user = payload;
      this.logger.log(`[KDS] Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      this.logger.warn(`[KDS] Client ${client.id} rejected — invalid token`);
      client.emit('error', { message: 'Token inválido ou expirado' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[KDS] Client disconnected: ${client.id}`);
  }

  // ── Room join ──────────────────────────────────────────────────────────────

  /** Cozinheiro/atendente entra na sala da pizzaria para receber eventos KDS */
  @SubscribeMessage('join:pizzeria')
  handleJoinPizzeria(
    @MessageBody() data: { pizzariaId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `pizzaria:${data.pizzariaId}`;
    client.join(room);
    client.emit('joined', { room });
    this.logger.log(`[KDS] Client ${client.id} joined room: ${room}`);
  }

  // ── Métodos chamados pelo KdsService ───────────────────────────────────────

  /** Notifica a cozinha que novos itens chegaram à fila */
  notifyItemNew(pizzariaId: string, items: KdsItem[]) {
    this.server.to(`pizzaria:${pizzariaId}`).emit('kds:item:new', items);
  }

  /** Notifica a cozinha que um item mudou de status */
  notifyItemUpdated(
    pizzariaId: string,
    payload: { itemId: string; status: string; updatedAt: Date },
  ) {
    this.server.to(`pizzaria:${pizzariaId}`).emit('kds:item:updated', payload);
  }

  /** Notifica que a fila de itens DONE foi limpa */
  notifyQueueCleared(pizzariaId: string, removed: number) {
    this.server
      .to(`pizzaria:${pizzariaId}`)
      .emit('kds:queue:cleared', { pizzariaId, removed });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isLocalToken(token: string): boolean {
    try {
      const [, payloadB64] = token.split('.');
      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
        iss?: string;
      };
      return decoded.iss === 'pizzaria-backend';
    } catch {
      return false;
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authToken: string | undefined = (client.handshake.auth as any)?.token;
    if (authToken) {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }
    const header: string | undefined = client.handshake.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}
