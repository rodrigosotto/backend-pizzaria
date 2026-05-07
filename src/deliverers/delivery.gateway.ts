import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Gateway WebSocket para notificações de entrega em tempo real.
 *
 * Eventos emitidos pelo servidor:
 *   - `delivery:assigned`  → emitido para a sala `deliverer:{delivererId}` quando um pedido é atribuído
 *   - `delivery:available` → emitido para a sala `pizzeria:{pizzeriaId}` quando um pedido está disponível para coleta
 *
 * O cliente (entregador) deve:
 *   1. Conectar ao socket
 *   2. Emitir `join:deliverer` com { delivererId }
 *   3. Escutar `delivery:assigned` para receber pedidos atribuídos automaticamente
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/delivery',
})
export class DeliveryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`[WS] Deliverer client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] Deliverer client disconnected: ${client.id}`);
  }

  /** Entregador entra na sua sala privada */
  @SubscribeMessage('join:deliverer')
  handleJoinDeliverer(
    @MessageBody() data: { delivererId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `deliverer:${data.delivererId}`;
    client.join(room);
    client.emit('joined', { room });
  }

  /** Atendente/cozinha entra na sala da pizzaria */
  @SubscribeMessage('join:pizzeria')
  handleJoinPizzeria(
    @MessageBody() data: { pizzeriaId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `pizzeria:${data.pizzeriaId}`;
    client.join(room);
    client.emit('joined', { room });
  }

  // ── Métodos chamados por outros services ────────────────────────────────────

  /** Notifica o entregador que um pedido foi atribuído a ele */
  notifyDelivererAssigned(delivererId: string, order: {
    id: string;
    orderNumber: number;
    deliveryAddressId?: string | null;
    total: { toString(): string } | number | string;
  }) {
    this.server.to(`deliverer:${delivererId}`).emit('delivery:assigned', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
    });
  }

  /** Notifica todos os entregadores da pizzaria que há um pedido disponível */
  notifyDeliveryAvailable(pizzeriaId: string, order: {
    id: string;
    orderNumber: number;
    total: { toString(): string } | number | string;
  }) {
    this.server.to(`pizzeria:${pizzeriaId}`).emit('delivery:available', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
    });
  }
}
