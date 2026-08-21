import { Injectable, Logger } from '@nestjs/common';

/**
 * PostgreSQL is the durable queue for outbound WhatsApp messages. The worker
 * claims rows atomically, so enqueueing never depends on an in-memory queue.
 */
@Injectable()
export class WhatsAppDeliveryQueueService {
  private readonly logger = new Logger(WhatsAppDeliveryQueueService.name);

  enqueue(messageId: string, correlationId?: string): void {
    this.logger.debug(`Queued WhatsApp delivery ${messageId}${correlationId ? ` (${correlationId})` : ''}`);
  }
}
