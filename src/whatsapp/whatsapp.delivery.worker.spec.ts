import { ConfigService } from '@nestjs/config';
import { WhatsAppApiError } from './whatsapp.errors';
import { WhatsAppDeliveryWorker } from './whatsapp.delivery.worker';

describe('WhatsAppDeliveryWorker', () => {
  const config = (values: Record<string, string> = {}) => ({
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  }) as unknown as ConfigService;

  function makeContext(overrides: { claimCount?: number; attempts?: number; sendError?: unknown } = {}) {
    const prisma = {
      db: {
        chatMessage: {
          findMany: jest.fn().mockResolvedValue([{ id: 'message-1' }]),
          updateMany: jest.fn().mockResolvedValue({ count: overrides.claimCount ?? 1 }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'message-1', attempts: overrides.attempts ?? 1, correlationId: 'corr-1', messageType: 'text',
            deliveryPayload: { to: '5511999999999', body: 'Olá' },
            conversation: { id: 'conversation-1', pizzeriaId: 'pizzeria-1', whatsappAccountId: 'account-1', customer: { phone: '5511999999999' } },
          }),
          update: jest.fn().mockResolvedValue({ id: 'message-1', status: 'sent' }),
        },
        whatsAppAccount: {
          findFirst: jest.fn().mockResolvedValue({ id: 'account-1', phoneNumberId: 'phone-1' }),
        },
      },
    };
    const whatsapp = {
      sendTextForAccount: jest.fn().mockImplementation(() => overrides.sendError
        ? Promise.reject(overrides.sendError)
        : Promise.resolve({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] })),
      sendTemplateForAccount: jest.fn(),
    };
    const worker = new WhatsAppDeliveryWorker(prisma as any, whatsapp as any, config({
      WHATSAPP_MAX_ATTEMPTS: '3',
      WHATSAPP_RETRY_BASE_DELAY_MS: '100',
      WHATSAPP_RETRY_MAX_DELAY_MS: '1000',
    }));
    return { prisma, whatsapp, worker };
  }

  it('uses exponential backoff with a configured cap', () => {
    const { worker } = makeContext();
    expect(worker.calculateBackoffMs(1)).toBe(100);
    expect(worker.calculateBackoffMs(2)).toBe(200);
    expect(worker.calculateBackoffMs(4)).toBe(800);
    expect(worker.calculateBackoffMs(5)).toBe(1000);
  });

  it('claims and sends a queued message exactly once', async () => {
    const { prisma, whatsapp, worker } = makeContext();
    await expect(worker.processDueMessages()).resolves.toBe(1);
    expect(prisma.db.chatMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1', status: 'queued' },
      data: expect.objectContaining({ status: 'processing', attempts: { increment: 1 } }),
    }));
    expect(whatsapp.sendTextForAccount).toHaveBeenCalledWith(
      { id: 'account-1', phoneNumberId: 'phone-1' },
      { to: '5511999999999', body: 'Olá' },
    );
    expect(prisma.db.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'sent', wamid: 'wamid.1', processingStartedAt: null }),
    }));
  });

  it('reschedules a temporary provider error with exponential backoff', async () => {
    const error = new WhatsAppApiError('rate_limited', 'temporary', 429, 131000, undefined, undefined, true);
    const { prisma, worker } = makeContext({ sendError: error, attempts: 1 });
    await worker.processDueMessages();
    expect(prisma.db.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'queued', errorCode: '131000', processingStartedAt: null, nextAttemptAt: expect.any(Date) }),
    }));
  });

  it('moves permanent provider errors to final failure without retry', async () => {
    const error = new WhatsAppApiError('bad_request', 'invalid payload', 400);
    const { prisma, worker } = makeContext({ sendError: error, attempts: 1 });
    await worker.processDueMessages();
    expect(prisma.db.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', nextAttemptAt: null, errorCode: '400' }),
    }));
  });

  it('does not send when another worker already claimed the row', async () => {
    const { prisma, whatsapp, worker } = makeContext({ claimCount: 0 });
    await expect(worker.processDueMessages()).resolves.toBe(0);
    expect(prisma.db.chatMessage.findUnique).not.toHaveBeenCalled();
    expect(whatsapp.sendTextForAccount).not.toHaveBeenCalled();
  });

  it('does not retry an unexpected worker failure', async () => {
    const { prisma, worker } = makeContext({ sendError: new Error('worker failure'), attempts: 1 });
    await worker.processDueMessages();
    expect(prisma.db.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', errorCode: 'unknown' }),
    }));
  });
});
