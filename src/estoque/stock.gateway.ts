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

/**
 * Gateway WebSocket para alertas de estoque em tempo real.
 *
 * Namespace: /stock
 *
 * Fluxo do cliente:
 *   1. Conectar: io('/stock')
 *   2. Emitir `join:pizzeria` com { pizzariaId } para entrar na sala
 *   3. Escutar eventos emitidos pelo servidor
 *
 * Eventos emitidos pelo servidor:
 *   - stock:alert → um ou mais insumos atingiram o estoque mínimo (RN04)
 *     Payload: { pizzariaId, alerts: [{ id, name, quantity, minQuantity, unit }] }
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/stock',
})
export class StockGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(StockGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`[Stock WS] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[Stock WS] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:pizzeria')
  handleJoinPizzeria(
    @MessageBody() data: { pizzariaId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `pizzeria:${data.pizzariaId}`;
    client.join(room);
    client.emit('joined', { room });
    this.logger.log(`[Stock WS] Client ${client.id} joined room: ${room}`);
  }

  /**
   * RN04 — Emite alerta quando insumo(s) atingem estoque mínimo.
   * Chamado pelo OrdersService após cada baixa automática.
   */
  notifyStockAlert(
    pizzariaId: string,
    alerts: Array<{
      id: string;
      name: string;
      quantity: number;
      minQuantity: number;
      unit: string;
    }>,
  ) {
    this.server.to(`pizzeria:${pizzariaId}`).emit('stock:alert', {
      pizzariaId,
      alerts,
    });
    this.logger.warn(
      `[Stock WS] Alerta emitido para pizzaria ${pizzariaId}: ${alerts.map((a) => a.name).join(', ')}`,
    );
  }
}
