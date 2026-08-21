import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WhatsAppWebhookService } from './whatsapp.webhook.service';

describe('WhatsApp webhook', () => {
  const appSecret = 'fixture-app-secret';
  const verificationToken = 'fixture-verification-token';
  let service: WhatsAppWebhookService;
  let controller: WhatsAppWebhookController;
  let inbound: { process: jest.Mock };

  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'business-account-fixture',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'phone-fixture' },
          contacts: [{ wa_id: '5511999999999', profile: { name: 'Cliente Fixture' } }],
          messages: [{ id: 'wamid.fixture.1', from: '5511999999999', type: 'text', timestamp: '1787227200', text: { body: 'Mensagem fixture' } }],
        },
      }],
    }],
  };

  const reply = () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    return response;
  };

  beforeEach(() => {
    const values: Record<string, string> = {
      WHATSAPP_APP_SECRET: appSecret,
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: verificationToken,
    };
    const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
    service = new WhatsAppWebhookService(config);
    inbound = { process: jest.fn().mockResolvedValue({ processed: 1, duplicates: 0, skipped: 0, statusesUpdated: 0 }) };
    controller = new WhatsAppWebhookController(service, inbound as never);
  });

  function rawPayload(): Buffer {
    return Buffer.from(JSON.stringify(payload));
  }

  function signature(rawBody: Buffer): string {
    return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  }

  it('accepts a valid Meta verification handshake', () => {
    const response = reply();
    controller.verify({ 'hub.mode': 'subscribe', 'hub.verify_token': verificationToken, 'hub.challenge': 'challenge-fixture' }, response);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.type).toHaveBeenCalledWith('text/plain');
    expect(response.send).toHaveBeenCalledWith('challenge-fixture');
  });

  it('rejects an invalid verification token', () => {
    expect(() => service.verify('subscribe', 'wrong-token', 'challenge-fixture')).toThrow('Webhook verification failed');
  });

  it('accepts a valid signed webhook fixture and returns a safe acknowledgement', async () => {
    const body = rawPayload();
    const response = reply();
    await controller.receive({ rawBody: body, body: payload, headers: { 'x-hub-signature-256': signature(body) } } as unknown as any, response);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({ received: true, duplicate: false, processed: 1, duplicates: 0, skipped: 0, statusesUpdated: 0 });
    expect(inbound.process).toHaveBeenCalledTimes(1);
  });

  it('parses Meta delivery status events without trusting tenant ids from the payload', () => {
    const statusPayload = {
      ...payload,
      entry: [{
        id: 'business-account-fixture',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: 'phone-fixture' },
            statuses: [{ id: 'wamid.fixture.1', status: 'delivered', timestamp: '1787227201', recipient_id: '5511999999999' }],
          },
        }],
      }],
    };
    const parsed = service.parse(statusPayload);
    expect(parsed.statuses).toEqual([expect.objectContaining({
      businessAccountId: 'business-account-fixture',
      phoneNumberId: 'phone-fixture',
      wamid: 'wamid.fixture.1',
      status: 'delivered',
    })]);
  });

  it('rejects an invalid signature', async () => {
    const body = rawPayload();
    const response = reply();
    await expect(controller.receive({ rawBody: body, body: payload, headers: { 'x-hub-signature-256': 'sha256=invalid' } } as unknown as any, response)).rejects.toThrow('Invalid webhook signature');
  });

  it('rejects an invalid payload after signature verification', async () => {
    const body = Buffer.from(JSON.stringify({ object: 'not-whatsapp', entry: [] }));
    const response = reply();
    await expect(controller.receive({ rawBody: body, body: { object: 'not-whatsapp', entry: [] }, headers: { 'x-hub-signature-256': signature(body) } } as unknown as any, response)).rejects.toThrow('Invalid WhatsApp webhook payload');
  });

  it('acknowledges a repeated external message id as duplicate', async () => {
    const body = rawPayload();
    const headers = { 'x-hub-signature-256': signature(body) };
    const first = reply();
    const second = reply();
    const request = { rawBody: body, body: payload, headers } as unknown as any;
    await controller.receive(request, first);
    await controller.receive(request, second);
    expect(second.status).toHaveBeenCalledWith(200);
    expect(second.send).toHaveBeenCalledWith({ received: true, duplicate: true, processed: 0, duplicates: 1, skipped: 0, statusesUpdated: 0 });
    expect(inbound.process).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when raw bytes are unavailable', async () => {
    const response = reply();
    await controller.receive({ body: payload, headers: {} } as unknown as any, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith({ received: false });
  });
});
