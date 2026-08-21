import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ChatChannel, ChatMessageDirection, ChatMessageStatus, ChatMessageType, Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { WhatsAppInboundMessage, ParsedWhatsAppWebhook, WhatsAppStatusUpdate } from './whatsapp.webhook.types';
import { ChatGateway } from '../chat/chat.gateway';

export interface WhatsAppInboundResult {
  processed: number;
  duplicates: number;
  skipped: number;
  statusesUpdated: number;
}

type PersistedInboundResult =
  | { kind: 'created'; pizzeriaId: string; conversationId: string; message: unknown }
  | { kind: 'duplicate' };

@Injectable()
export class WhatsAppInboundService {
  private readonly logger = new Logger(WhatsAppInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly chatGateway?: ChatGateway,
  ) {}

  async process(parsed: ParsedWhatsAppWebhook): Promise<WhatsAppInboundResult> {
    let processed = 0;
    let duplicates = 0;
    let skipped = parsed.messageIds.length - parsed.messages.length;

    for (const message of parsed.messages) {
      const result = await this.persistMessage(message);
      if (result.kind === 'duplicate') {
        duplicates += 1;
        continue;
      }
      processed += 1;
      await this.publishCreated(result);
    }

    let statusesUpdated = 0;
    for (const status of parsed.statuses ?? []) {
      if (await this.persistStatus(status)) statusesUpdated += 1;
    }

    this.logger.debug(`Processed ${processed} WhatsApp inbound message(s), ${duplicates} duplicate(s), ${skipped} skipped, ${statusesUpdated} status update(s)`);
    return { processed, duplicates, skipped, statusesUpdated };
  }

  private async persistStatus(status: WhatsAppStatusUpdate): Promise<boolean> {
    const account = await this.prisma.db.whatsAppAccount.findUnique({
      where: { phoneNumberId: status.phoneNumberId },
      select: { id: true, pizzeriaId: true, businessAccountId: true },
    });
    if (!account || (account.businessAccountId && account.businessAccountId !== status.businessAccountId)) return false;

    const message = await this.prisma.db.chatMessage.findFirst({
      where: {
        wamid: status.wamid,
        conversation: { pizzeriaId: account.pizzeriaId, whatsappAccountId: account.id },
      },
      select: { id: true, status: true, conversationId: true },
    });
    if (!message) return false;

    const nextStatus = status.status;
    const currentRank = this.statusRank(message.status);
    const nextRank = this.statusRank(nextStatus);
    if (nextStatus !== 'failed' && nextRank < currentRank) return false;

    await this.prisma.db.chatMessage.update({
      where: { id: message.id },
      data: {
        status: nextStatus,
        statusUpdatedAt: status.timestamp,
        externalTimestamp: status.timestamp,
        errorCode: nextStatus === 'failed' ? status.errorCode ?? 'provider' : null,
        errorMessage: nextStatus === 'failed' ? status.errorMessage ?? 'WhatsApp delivery failed' : null,
      },
    });

    this.chatGateway?.notifyMessageUpdated(account.pizzeriaId, message.conversationId, { ...message, status: nextStatus, statusUpdatedAt: status.timestamp });
    return true;
  }

  private statusRank(status: string): number {
    return ({ queued: 0, processing: 1, sent: 2, delivered: 3, read: 4, failed: 5 } as Record<string, number>)[status] ?? 0;
  }

  private async persistMessage(message: WhatsAppInboundMessage): Promise<PersistedInboundResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.db.$transaction(async (tx) => {
        const account = await tx.whatsAppAccount.findUnique({
          where: { phoneNumberId: message.phoneNumberId },
          select: { id: true, pizzeriaId: true, status: true, businessAccountId: true },
        });
        if (!account || account.status !== 'active') {
          throw new NotFoundException('WhatsApp account not found or inactive');
        }
        if (account.businessAccountId && account.businessAccountId !== message.businessAccountId) {
          throw new NotFoundException('WhatsApp account does not match webhook business account');
        }

        const existing = await tx.chatMessage.findUnique({ where: { wamid: message.wamid }, select: { id: true } });
        if (existing) return { kind: 'duplicate' };

        const phone = this.normalizePhone(message.from);
        const customer = await tx.customer.upsert({
          where: { pizzeriaId_phone: { pizzeriaId: account.pizzeriaId, phone } },
          create: {
            pizzeriaId: account.pizzeriaId,
            name: message.profileName ?? `WhatsApp ${phone}`,
            phone,
          },
          update: {},
          select: { id: true },
        });

        const conversation = await tx.chatConversation.upsert({
          where: { pizzeriaId_customerId: { pizzeriaId: account.pizzeriaId, customerId: customer.id } },
          create: {
            pizzeriaId: account.pizzeriaId,
            customerId: customer.id,
            whatsappAccountId: account.id,
            channel: ChatChannel.whatsapp,
            status: 'open',
          },
          update: {
            whatsappAccountId: account.id,
            channel: ChatChannel.whatsapp,
            status: 'open',
          },
          select: { id: true, lastMessageAt: true },
        });

        const createdMessage = await tx.chatMessage.create({
          data: {
            conversationId: conversation.id,
            content: message.text,
            senderType: 'customer',
            senderId: customer.id,
            isAutomatic: false,
            channel: ChatChannel.whatsapp,
            direction: ChatMessageDirection.inbound,
            messageType: ChatMessageType.text,
            externalMessageId: message.wamid,
            wamid: message.wamid,
            status: ChatMessageStatus.delivered,
            statusUpdatedAt: new Date(),
            externalTimestamp: message.timestamp,
          },
        });

        const lastMessageAt = conversation.lastMessageAt && conversation.lastMessageAt > message.timestamp
          ? conversation.lastMessageAt
          : message.timestamp;
        await tx.chatConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt,
            unreadCount: { increment: 1 },
            version: { increment: 1 },
          },
        });
        return {
          kind: 'created',
          pizzeriaId: account.pizzeriaId,
          conversationId: conversation.id,
          message: createdMessage,
        };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        if (this.isUniqueViolation(error)) {
          const existing = await this.prisma.db.chatMessage.findUnique({ where: { wamid: message.wamid }, select: { id: true } });
          if (existing) return { kind: 'duplicate' };
        }
        throw error;
      }
    }
    throw new Error('WhatsApp inbound transaction retry limit exceeded');
  }

  private async publishCreated(result: Extract<PersistedInboundResult, { kind: 'created' }>): Promise<void> {
    if (!this.chatGateway) return;
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id: result.conversationId, pizzeriaId: result.pizzeriaId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { content: true, senderType: true, createdAt: true },
        },
      },
    });
    const conversationPayload = conversation
      ? { ...conversation, lastMessage: conversation.messages[0] ?? null, messages: undefined }
      : { id: result.conversationId, pizzeriaId: result.pizzeriaId };
    this.chatGateway.notifyMessageCreated(result.pizzeriaId, result.conversationId, result.message, conversationPayload);
    this.chatGateway.notifyConversationUpdated(result.pizzeriaId, result.conversationId, conversationPayload);
  }

  private normalizePhone(value: string): string {
    const phone = value.replace(/\D/g, '');
    if (phone.length < 5 || phone.length > 20) throw new NotFoundException('Invalid WhatsApp customer phone');
    return phone;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isSerializationConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
  }
}
