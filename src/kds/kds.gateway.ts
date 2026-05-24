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
import type { KdsItem } from '@prisma/client';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/kds',
})
export class KdsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`[WS /kds] connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS /kds] disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:pizzeria')
  handleJoinPizzeria(
    @MessageBody() data: { pizzariaId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `pizzaria:${data.pizzariaId}`;
    client.join(room);
    client.emit('joined', { room });
  }

  notifyItemsNew(pizzeriaId: string, items: KdsItem[]) {
    this.server.to(`pizzaria:${pizzeriaId}`).emit('kds:item:new', items);
  }

  notifyItemUpdated(pizzeriaId: string, payload: { itemId: string; status: string; updatedAt: string }) {
    this.server.to(`pizzaria:${pizzeriaId}`).emit('kds:item:updated', payload);
  }

  notifyQueueCleared(pizzeriaId: string) {
    this.server.to(`pizzaria:${pizzeriaId}`).emit('kds:queue:cleared', { pizzeriaId });
  }
}
