import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { FastifyReply } from 'fastify';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WhatsAppWebhookService } from './whatsapp.webhook.service';

describe('WhatsApp webhook → inbound service → Prisma integration', () => {
  const appSecret = 'integration-app-secret';
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'business-a',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'phone-a' },
              messages: [
                {
                  id: 'wamid.integration.1',
                  from: '5511999999999',
                  type: 'text',
                  timestamp: '1787227200',
                  text: { body: 'Olá integração' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('validates, maps the account tenant and persists one message idempotently', async () => {
    const created = {
      id: 'message-1',
      wamid: 'wamid.integration.1',
      senderType: 'customer',
    };
    const tx = {
      whatsAppAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'account-a',
            pizzeriaId: 'tenant-a',
            status: 'active',
            businessAccountId: 'business-a',
          }),
      },
      chatMessage: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'message-1' }),
        create: jest.fn().mockResolvedValue(created),
      },
      customer: { upsert: jest.fn().mockResolvedValue({ id: 'customer-a' }) },
      chatConversation: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'conversation-a', lastMessageAt: null }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      db: {
        $transaction: jest.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
        chatMessage: {
          findUnique: jest.fn().mockResolvedValue({ id: 'message-1' }),
        },
      },
    };
    const inbound = new WhatsAppInboundService(prisma as any);
    const config = {
      get: jest.fn((key: string) =>
        key === 'WHATSAPP_APP_SECRET' ? appSecret : undefined,
      ),
    } as unknown as ConfigService;
    const webhook = new WhatsAppWebhookService(config);
    const controller = new WhatsAppWebhookController(webhook, inbound);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const reply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    const request = {
      rawBody,
      body: payload,
      headers: {
        'x-hub-signature-256': `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`,
      },
    } as any;

    await controller.receive(request, reply);
    expect(tx.whatsAppAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneNumberId: 'phone-a' } }),
    );
    expect(tx.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pizzeriaId_phone: { pizzeriaId: 'tenant-a', phone: '5511999999999' },
        },
      }),
    );
    expect(tx.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wamid: 'wamid.integration.1',
          senderType: 'customer',
        }),
      }),
    );
    expect(reply.send).toHaveBeenCalledWith({
      received: true,
      duplicate: false,
      processed: 1,
      duplicates: 0,
      skipped: 0,
    });

    const secondReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    await controller.receive(request, secondReply);
    expect(secondReply.send).toHaveBeenCalledWith({
      received: true,
      duplicate: true,
      processed: 0,
      duplicates: 1,
      skipped: 0,
    });
    expect(tx.chatMessage.create).toHaveBeenCalledTimes(1);
  });
});
