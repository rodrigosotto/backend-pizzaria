import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PizzeriaUserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../infra/database/prisma.service';
import { SupabaseJwtService } from '../modules/auth/supabase-jwt.service';
import { parseCorsOrigins } from '../core/config/cors.config';

export const CHAT_ROOM_PREFIX = 'chat:pizzeria:';

export interface ChatRealtimePayload {
  pizzeriaId: string;
  conversationId: string;
  message?: unknown;
  conversation?: unknown;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: parseCorsOrigins() },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseJwt: SupabaseJwtService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) return this.reject(client, 'Token JWT obrigatório');

    try {
      const payload = await this.verifyToken(token);
      const user = await this.prisma.db.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true },
      });
      if (!user?.isActive) return this.reject(client, 'Usuário inválido ou inativo');
      client.data.userId = user.id;
      this.logger.debug(`Chat socket connected: ${client.id}`);
    } catch {
      return this.reject(client, 'Token inválido ou expirado');
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Chat socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:pizzeria')
  async handleJoinPizzeria(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const pizzeriaId = this.readPizzeriaId(data);
    const userId = client.data.userId as string | undefined;
    if (!pizzeriaId || !userId) {
      client.emit('chat:error', { message: 'Contexto de pizzaria inválido' });
      return;
    }

    const role = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId, pizzeriaId } },
      select: { isActive: true, role: true },
    });
    if (!role?.isActive || (role.role !== PizzeriaUserRole.admin && role.role !== PizzeriaUserRole.atendente)) {
      client.emit('chat:error', { message: 'Sem acesso ao chat desta pizzaria' });
      return;
    }

    const room = `${CHAT_ROOM_PREFIX}${pizzeriaId}`;
    await client.join(room);
    client.data.chatPizzeriaIds = [...new Set([...(client.data.chatPizzeriaIds ?? []), pizzeriaId])];
    client.emit('joined', { room });
  }

  notifyMessageCreated(pizzeriaId: string, conversationId: string, message: unknown, conversation?: unknown): void {
    this.emit('message.created', { pizzeriaId, conversationId, message: this.sanitizeMessage(message), conversation });
  }

  notifyMessageUpdated(pizzeriaId: string, conversationId: string, message: unknown, conversation?: unknown): void {
    this.emit('message.updated', { pizzeriaId, conversationId, message: this.sanitizeMessage(message), conversation });
  }

  notifyConversationUpdated(pizzeriaId: string, conversationId: string, conversation: unknown): void {
    this.emit('conversation.updated', { pizzeriaId, conversationId, conversation });
  }

  notifyConversationAssigned(pizzeriaId: string, conversationId: string, conversation: unknown): void {
    this.emit('conversation.assigned', { pizzeriaId, conversationId, conversation });
  }

  notifyConversationStatusChanged(pizzeriaId: string, conversationId: string, conversation: unknown): void {
    this.emit('conversation.status_changed', { pizzeriaId, conversationId, conversation });
  }

  private emit(event: string, payload: ChatRealtimePayload): void {
    this.server.to(`${CHAT_ROOM_PREFIX}${payload.pizzeriaId}`).emit(event, payload);
  }

  private sanitizeMessage(message: unknown): unknown {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return message;
    const { deliveryPayload: _deliveryPayload, correlationId: _correlationId, ...safeMessage } = message as Record<string, unknown>;
    return safeMessage;
  }

  private async verifyToken(token: string): Promise<{ sub: string }> {
    try {
      const [, payloadB64] = token.split('.');
      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { iss?: string };
      if (decoded.iss === 'pizzaria-backend') {
        return this.jwtService.verify<{ sub: string }>(token, {
          secret: process.env.JWT_SECRET,
          issuer: 'pizzaria-backend',
        });
      }
    } catch {
      // Tenta o verificador Supabase abaixo.
    }
    return this.supabaseJwt.verifyToken(token);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;
    const header = client.handshake.headers.authorization;
    const token = authToken ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    return token?.startsWith('Bearer ') ? token.slice(7) : token;
  }

  private readPizzeriaId(data: unknown): string | undefined {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
    const value = (data as { pizzeriaId?: unknown }).pizzeriaId;
    return typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : undefined;
  }

  private reject(client: Socket, message: string): void {
    client.emit('chat:error', { message });
    client.disconnect(true);
  }
}
