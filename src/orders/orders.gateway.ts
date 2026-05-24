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

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`[WS /orders] connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS /orders] disconnected: ${client.id}`);
  }

  /** Cliente entra na sala da pizzaria para receber eventos de pedidos. */
  @SubscribeMessage('join:room')
  handleJoinRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.room);
    client.emit('joined', { room: data.room });
  }

  notifyNewOrder(pizzeriaId: string, order: Record<string, unknown>) {
    this.server.to(`pizzaria:${pizzeriaId}`).emit('order:created', order);
  }

  notifyOrderUpdated(pizzeriaId: string, order: Record<string, unknown>) {
    this.server.to(`pizzaria:${pizzeriaId}`).emit('order:updated', order);
  }

  notifyOrderStatusChanged(pizzeriaId: string, order: Record<string, unknown>) {
    this.server.to(`pizzaria:${pizzeriaId}`).emit('order:status:changed', order);
  }
}
