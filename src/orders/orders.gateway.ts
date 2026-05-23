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
import { Server, Socket } from 'socket.io';
import type { OrderStatus, OrderType } from '@prisma/client';

/**
 * Gateway WebSocket para eventos de pedidos em tempo real.
 *
 * Namespace: /orders
 *
 * Fluxo do cliente:
 *   1. Conectar: io('/orders')
 *   2. Emitir `join:pizzeria` com { pizzariaId } para entrar na sala
 *   3. Escutar eventos emitidos pelo servidor
 *
 * Eventos emitidos pelo servidor:
 *   - order:created        → novo pedido criado
 *   - order:status:changed → pedido mudou de status
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`[Orders WS] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[Orders WS] Client disconnected: ${client.id}`);
  }

  /** Cliente entra na sala da pizzaria para receber eventos de pedidos */
  @SubscribeMessage('join:pizzeria')
  handleJoinPizzeria(
    @MessageBody() data: { pizzariaId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `pizzeria:${data.pizzariaId}`;
    client.join(room);
    client.emit('joined', { room });
    this.logger.log(`[Orders WS] Client ${client.id} joined room: ${room}`);
  }

  // ── Métodos chamados pelo OrdersService ─────────────────────────────────────

  /** Emite quando um novo pedido é criado */
  notifyOrderCreated(pizzariaId: string, order: {
    id: string;
    orderNumber: number;
    type: OrderType;
    status: OrderStatus;
    total: { toString(): string } | number | string;
    requiresKitchen: boolean;
    createdAt: Date;
  }) {
    this.server.to(`pizzeria:${pizzariaId}`).emit('order:created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: order.type,
      status: order.status,
      total: order.total,
      requiresKitchen: order.requiresKitchen,
      createdAt: order.createdAt,
    });
  }

  /** Emite quando o status de um pedido muda */
  notifyOrderStatusChanged(pizzariaId: string, payload: {
    orderId: string;
    orderNumber: number;
    previousStatus: OrderStatus;
    status: OrderStatus;
    updatedAt: Date;
  }) {
    this.server.to(`pizzeria:${pizzariaId}`).emit('order:status:changed', payload);
  }
}
