import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatWhatsAppRateLimitGuard } from './chat-whatsapp-rate-limit.guard';

describe('ChatWhatsAppRateLimitGuard', () => {
  function context(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('limits webhook requests by source IP', () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'WHATSAPP_WEBHOOK_RATE_LIMIT_MAX' ? '1' : fallback,
      ),
    } as unknown as ConfigService;
    const guard = new ChatWhatsAppRateLimitGuard(config);
    const request = {
      method: 'POST',
      url: '/webhooks/whatsapp',
      ip: '203.0.113.10',
    };
    expect(guard.canActivate(context(request))).toBe(true);
    expect(() => guard.canActivate(context(request))).toThrow(
      'Limite de requisições excedido',
    );
  });

  it('keys chat limits by authenticated user and tenant', () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'CHAT_SEND_RATE_LIMIT_MAX' ? '1' : fallback,
      ),
    } as unknown as ConfigService;
    const guard = new ChatWhatsAppRateLimitGuard(config);
    const requestA = {
      method: 'POST',
      url: '/api/v1/chat/conversations/c1/messages',
      user: { sub: 'user-1' },
      pizzeriaId: 'tenant-a',
    };
    const requestB = { ...requestA, pizzeriaId: 'tenant-b' };
    expect(guard.canActivate(context(requestA))).toBe(true);
    expect(guard.canActivate(context(requestB))).toBe(true);
    expect(() => guard.canActivate(context(requestA))).toThrow(
      'Limite de requisições excedido',
    );
  });
});
