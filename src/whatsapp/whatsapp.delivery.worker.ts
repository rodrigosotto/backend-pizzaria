import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessageStatus, ChatMessageType } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { WhatsAppApiError } from './whatsapp.errors';
import { WhatsAppService } from './whatsapp.service';

type DeliveryPayload = { to: string; body?: string; name?: string; language?: string; parameters?: string[] };

@Injectable()
export class WhatsAppDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppDeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
    @Optional() private readonly gateway?: ChatGateway,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('WHATSAPP_DELIVERY_WORKER_ENABLED', 'true') !== 'true') return;
    const interval = this.numberConfig('WHATSAPP_DELIVERY_POLL_INTERVAL_MS', 1000);
    this.timer = setInterval(() => { void this.processDueMessages(); }, interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  calculateBackoffMs(attempt: number): number {
    const base = this.numberConfig('WHATSAPP_RETRY_BASE_DELAY_MS', 1000);
    const maximum = this.numberConfig('WHATSAPP_RETRY_MAX_DELAY_MS', 300000);
    return Math.min(maximum, base * (2 ** Math.max(0, attempt - 1)));
  }

  async processDueMessages(limit = this.numberConfig('WHATSAPP_DELIVERY_BATCH_SIZE', 10)): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = new Date();
      const candidates = await this.prisma.db.chatMessage.findMany({
        where: {
          channel: 'whatsapp', direction: 'outbound', status: 'queued',
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: limit,
        select: { id: true },
      });
      let processed = 0;
      for (const candidate of candidates) {
        const claim = await this.prisma.db.chatMessage.updateMany({
          where: { id: candidate.id, status: 'queued' },
          data: { status: 'processing', processingStartedAt: now, statusUpdatedAt: now, attempts: { increment: 1 } },
        });
        if (claim.count !== 1) continue;
        processed += 1;
        await this.deliver(candidate.id);
      }
      return processed;
    } finally {
      this.running = false;
    }
  }

  private async deliver(messageId: string): Promise<void> {
    const message = await this.prisma.db.chatMessage.findUnique({
      where: { id: messageId },
      include: { conversation: { select: { id: true, pizzeriaId: true, customer: { select: { phone: true } }, whatsappAccountId: true } } },
    });
    if (!message || !message.conversation.whatsappAccountId) {
      await this.finalizeFailure(messageId, new WhatsAppApiError('not_found', 'WhatsApp account not found', 404));
      return;
    }
    const account = await this.prisma.db.whatsAppAccount.findFirst({
      where: { id: message.conversation.whatsappAccountId, pizzeriaId: message.conversation.pizzeriaId, status: 'active' },
      select: { id: true, phoneNumberId: true },
    });
    if (!account) {
      await this.finalizeFailure(messageId, new WhatsAppApiError('not_found', 'WhatsApp account not found', 404));
      return;
    }

    try {
      const payload = (message.deliveryPayload ?? {}) as DeliveryPayload;
      const response = message.messageType === ChatMessageType.template
        ? await this.whatsapp.sendTemplateForAccount(account, { to: payload.to, name: payload.name!, language: payload.language!, parameters: payload.parameters })
        : await this.whatsapp.sendTextForAccount(account, { to: payload.to, body: payload.body! });
      const wamid = response.messages?.[0]?.id;
      if (!wamid) throw new WhatsAppApiError('provider', 'WhatsApp API returned no message id');
      const sent = await this.prisma.db.chatMessage.update({
        where: { id: messageId, status: 'processing' },
        data: { wamid, externalMessageId: wamid, status: 'sent', statusUpdatedAt: new Date(), processingStartedAt: null, nextAttemptAt: null },
      });
      this.gateway?.notifyMessageUpdated(message.conversation.pizzeriaId, message.conversation.id, sent);
    } catch (error) {
      await this.handleFailure(message, error);
    }
  }

  private async handleFailure(message: any, error: unknown): Promise<void> {
    const apiError = error instanceof WhatsAppApiError ? error : new WhatsAppApiError('unknown', 'WhatsApp delivery failed');
    const maxAttempts = this.numberConfig('WHATSAPP_MAX_ATTEMPTS', 5);
    const retry = apiError.retryable && message.attempts < maxAttempts;
    const nextAttemptAt = retry ? new Date(Date.now() + this.calculateBackoffMs(message.attempts)) : null;
    const updated = await this.prisma.db.chatMessage.update({
      where: { id: message.id },
      data: {
        status: retry ? ChatMessageStatus.queued : ChatMessageStatus.failed,
        nextAttemptAt,
        processingStartedAt: null,
        statusUpdatedAt: new Date(),
        errorCode: apiError.providerCode?.toString() ?? apiError.statusCode?.toString() ?? apiError.kind,
        errorMessage: apiError.message.slice(0, 500),
      },
    });
    this.logger.warn(`WhatsApp delivery ${retry ? 'scheduled for retry' : 'moved to final failure'} message=${message.id} correlation=${message.correlationId ?? 'none'} attempt=${message.attempts} error=${apiError.kind}`);
    this.gateway?.notifyMessageUpdated(message.conversation.pizzeriaId, message.conversation.id, updated);
  }

  private async finalizeFailure(messageId: string, error: WhatsAppApiError): Promise<void> {
    await this.prisma.db.chatMessage.update({ where: { id: messageId }, data: { status: 'failed', processingStartedAt: null, statusUpdatedAt: new Date(), errorCode: error.kind, errorMessage: error.message } });
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key, String(fallback)));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
