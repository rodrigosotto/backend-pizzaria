import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

type Bucket = { count: number; resetAt: number };
type ChatRequest = FastifyRequest & {
  user?: { sub?: string };
  pizzeriaId?: string;
};

@Injectable()
export class ChatWhatsAppRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ChatRequest>();
    const path = request.url.split('?')[0];
    const isWebhook = path.includes('/webhooks/whatsapp');
    const isMessageSend =
      request.method === 'POST' &&
      /\/chat\/conversations\/[^/]+\/messages/.test(path);
    if (!isWebhook && !isMessageSend && !path.includes('/chat/')) return true;

    const windowMs = this.number('CHAT_RATE_LIMIT_WINDOW_MS', 60_000);
    const max = isWebhook
      ? this.number('WHATSAPP_WEBHOOK_RATE_LIMIT_MAX', 60)
      : isMessageSend
        ? this.number('CHAT_SEND_RATE_LIMIT_MAX', 30)
        : this.number('CHAT_RATE_LIMIT_MAX', 120);
    const identity = isWebhook
      ? `webhook:${request.ip ?? 'unknown'}`
      : `chat:${request.user?.sub ?? 'anonymous'}:${request.pizzeriaId ?? String(request.headers['x-pizzeria-id'] ?? 'unknown')}`;
    const key = `${identity}:${isWebhook ? 'webhook' : 'chat'}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);

    if (this.buckets.size > 10_000) {
      for (const [entryKey, entry] of this.buckets) {
        if (entry.resetAt <= now) this.buckets.delete(entryKey);
      }
    }
    if (bucket.count > max) {
      throw new HttpException(
        'Limite de requisições excedido',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private number(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key, String(fallback)));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
