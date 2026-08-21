import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ParsedWhatsAppWebhook, WhatsAppInboundMessage, WhatsAppStatusUpdate, WhatsAppWebhookResult } from './whatsapp.webhook.types';

const META_OBJECT = 'whatsapp_business_account';
const MAX_DEDUPE_ENTRIES = 10_000;
const DEDUPE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);
  private readonly processedKeys = new Map<string, number>();

  constructor(private readonly configService: ConfigService) {}

  verify(mode: unknown, token: unknown, challenge: unknown): string {
    const configuredToken = this.configService.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (mode !== 'subscribe' || typeof token !== 'string' || !configuredToken || !this.secureEquals(token, configuredToken)) {
      throw new ForbiddenException('Webhook verification failed');
    }
    if (typeof challenge !== 'string' || challenge.length === 0 || challenge.length > 512) {
      throw new BadRequestException('Invalid webhook challenge');
    }
    return challenge;
  }

  verifySignature(rawBody: Buffer, signatureHeader: unknown): void {
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret || typeof signatureHeader !== 'string') {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signatureHeader.startsWith('sha256=') ? signatureHeader.slice('sha256='.length) : '';
    if (!/^[a-f0-9]{64}$/i.test(received) || !this.secureEquals(received.toLowerCase(), expected)) {
      throw new ForbiddenException('Invalid webhook signature');
    }
  }

  parseAndRegister(rawBody: Buffer, body: unknown): WhatsAppWebhookResult {
    const parsed = this.parse(body);
    const keys = this.eventKeys(parsed, rawBody);
    const now = Date.now();
    this.removeExpired(now);
    const duplicate = keys.every((key) => this.processedKeys.has(key));
    for (const key of keys) this.processedKeys.set(key, now + DEDUPE_TTL_MS);
    while (this.processedKeys.size > MAX_DEDUPE_ENTRIES) {
      const oldest = this.processedKeys.keys().next().value;
      if (oldest) this.processedKeys.delete(oldest);
      else break;
    }
    this.logger.debug(`Accepted WhatsApp webhook with ${parsed.messageIds.length} message id(s) and ${parsed.statusIds.length} status id(s)`);
    return { ...parsed, duplicate };
  }

  releaseRegistration(rawBody: Buffer, parsed: ParsedWhatsAppWebhook): void {
    for (const key of this.eventKeys(parsed, rawBody)) this.processedKeys.delete(key);
  }

  parse(body: unknown): ParsedWhatsAppWebhook {
    if (!this.isRecord(body) || body.object !== META_OBJECT || !Array.isArray(body.entry) || body.entry.length === 0) {
      throw new BadRequestException('Invalid WhatsApp webhook payload');
    }

    const messageIds: string[] = [];
    const statusIds: string[] = [];
    const messages: WhatsAppInboundMessage[] = [];
    const statuses: WhatsAppStatusUpdate[] = [];
    let changeCount = 0;
    for (const entry of body.entry) {
      if (!this.isRecord(entry) || typeof entry.id !== 'string' || !Array.isArray(entry.changes) || entry.changes.length === 0) {
        throw new BadRequestException('Invalid WhatsApp webhook entry');
      }
      for (const change of entry.changes) {
        if (!this.isRecord(change) || typeof change.field !== 'string' || !this.isRecord(change.value)) {
          throw new BadRequestException('Invalid WhatsApp webhook change');
        }
        changeCount += 1;
        this.collectIds(change.value.messages, messageIds);
        this.collectIds(change.value.statuses, statusIds);
        this.collectMessages(entry.id, change.value, messages);
        this.collectStatuses(entry.id, change.value, statuses);
      }
    }
    return { entryCount: body.entry.length, changeCount, messageIds, statusIds, messages, statuses };
  }

  private collectIds(value: unknown, target: string[]): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new BadRequestException('Invalid WhatsApp webhook event collection');
    for (const item of value) {
      if (!this.isRecord(item) || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 512) {
        throw new BadRequestException('Invalid WhatsApp webhook event id');
      }
      target.push(item.id);
    }
  }

  private collectMessages(
    businessAccountId: string,
    value: unknown,
    target: WhatsAppInboundMessage[],
  ): void {
    if (!this.isRecord(value) || value.messages === undefined) return;
    if (!Array.isArray(value.messages)) throw new BadRequestException('Invalid WhatsApp webhook message collection');
    const metadata = value.metadata;
    const phoneNumberId = this.isRecord(metadata) ? metadata.phone_number_id : undefined;
    if (typeof phoneNumberId !== 'string' || phoneNumberId.length === 0 || phoneNumberId.length > 255) {
      throw new BadRequestException('WhatsApp phone number id is required for incoming messages');
    }

    for (const item of value.messages) {
      if (!this.isRecord(item) || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 255) {
        throw new BadRequestException('Invalid WhatsApp message');
      }
      if (typeof item.from !== 'string' || item.from.length === 0 || item.from.length > 32) {
        throw new BadRequestException('Invalid WhatsApp sender');
      }
      if (typeof item.timestamp !== 'string' || !/^\d{1,13}$/.test(item.timestamp)) {
        throw new BadRequestException('Invalid WhatsApp message timestamp');
      }
      const timestamp = new Date(Number(item.timestamp) * 1000);
      if (!Number.isFinite(timestamp.getTime())) throw new BadRequestException('Invalid WhatsApp message timestamp');

      // Fase 6 persiste somente texto. Outros tipos continuam sendo validados
      // pelo parser, mas permanecem fora do fluxo de negócio desta fase.
      if (item.type !== 'text') continue;
      if (!this.isRecord(item.text) || typeof item.text.body !== 'string' || item.text.body.length === 0 || item.text.body.length > 4096) {
        throw new BadRequestException('Invalid WhatsApp text message');
      }

      const profileName = this.profileNameFor(item.from, value.contacts);
      target.push({
        businessAccountId,
        phoneNumberId,
        wamid: item.id,
        from: item.from,
        timestamp,
        type: 'text',
        text: item.text.body,
        ...(profileName ? { profileName } : {}),
      });
    }
  }

  private collectStatuses(
    businessAccountId: string,
    value: unknown,
    target: WhatsAppStatusUpdate[],
  ): void {
    if (!this.isRecord(value) || value.statuses === undefined) return;
    if (!Array.isArray(value.statuses)) throw new BadRequestException('Invalid WhatsApp status collection');
    const metadata = value.metadata;
    const phoneNumberId = this.isRecord(metadata) ? metadata.phone_number_id : undefined;
    if (typeof phoneNumberId !== 'string' || phoneNumberId.length === 0 || phoneNumberId.length > 255) {
      throw new BadRequestException('WhatsApp phone number id is required for status updates');
    }

    for (const item of value.statuses) {
      if (!this.isRecord(item) || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 255) {
        throw new BadRequestException('Invalid WhatsApp status id');
      }
      if (item.status !== 'sent' && item.status !== 'delivered' && item.status !== 'read' && item.status !== 'failed') {
        throw new BadRequestException('Invalid WhatsApp message status');
      }
      if (typeof item.timestamp !== 'string' || !/^\d{1,13}$/.test(item.timestamp)) {
        throw new BadRequestException('Invalid WhatsApp status timestamp');
      }
      const timestamp = new Date(Number(item.timestamp) * 1000);
      if (!Number.isFinite(timestamp.getTime())) throw new BadRequestException('Invalid WhatsApp status timestamp');
      const errors = Array.isArray(item.errors) ? item.errors[0] : undefined;
      const errorCode = this.isRecord(errors) && (typeof errors.code === 'number' || typeof errors.code === 'string')
        ? String(errors.code)
        : undefined;
      const errorMessage = this.isRecord(errors) && typeof errors.title === 'string'
        ? errors.title.slice(0, 500)
        : undefined;
      target.push({
        businessAccountId,
        phoneNumberId,
        wamid: item.id,
        status: item.status,
        timestamp,
        ...(typeof item.recipient_id === 'string' ? { recipientId: item.recipient_id } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      });
    }
  }

  private profileNameFor(from: string, contacts: unknown): string | undefined {
    if (!Array.isArray(contacts)) return undefined;
    const contact = contacts.find((item) => this.isRecord(item) && item.wa_id === from);
    const profile = this.isRecord(contact) ? contact.profile : undefined;
    const name = this.isRecord(profile) ? profile.name : undefined;
    return typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, 100) : undefined;
  }

  private eventKeys(parsed: ParsedWhatsAppWebhook, rawBody: Buffer): string[] {
    const ids = [...new Set([...parsed.messageIds, ...parsed.statusIds])];
    if (ids.length > 0) return ids.map((id) => `event:${id}`);
    return [`payload:${createHash('sha256').update(rawBody).digest('hex')}`];
  }

  private removeExpired(now: number): void {
    for (const [key, expiresAt] of this.processedKeys) {
      if (expiresAt <= now) this.processedKeys.delete(key);
    }
  }

  private secureEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
