import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { WhatsAppApiError } from './whatsapp.errors';
import { WhatsAppClient } from './whatsapp.client';

describe('WhatsAppClient', () => {
  const token = 'test-token-that-must-not-be-logged';
  const credentials = { phoneNumberId: 'phone-number-123', accessToken: token };
  const input = { to: '5511999999999', body: 'Olá', previewUrl: false };
  let client: WhatsAppClient;

  beforeEach(() => {
    const values: Record<string, string> = {
      WHATSAPP_GRAPH_API_BASE_URL: 'https://graph.example.test/',
      WHATSAPP_GRAPH_API_VERSION: 'v99.0',
      WHATSAPP_HTTP_TIMEOUT_MS: '4321',
    };
    const config = { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) } as unknown as ConfigService;
    client = new WhatsAppClient(config);
    jest.restoreAllMocks();
  });

  it('constructs an authenticated text request with configured API settings', async () => {
    const response = { messaging_product: 'whatsapp' as const, messages: [{ id: 'wamid.1' }] };
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: response } as never);

    await expect(client.sendText(credentials, input)).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      'https://graph.example.test/v99.0/phone-number-123/messages',
      {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'text',
        text: { body: input.body, preview_url: false },
      },
      expect.objectContaining({
        timeout: 4321,
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('constructs an authenticated official template request with body parameters', async () => {
    const response = { messaging_product: 'whatsapp' as const, messages: [{ id: 'wamid.template.1' }] };
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: response } as never);

    await expect(client.sendTemplate(credentials, {
      to: input.to,
      name: 'order_update',
      language: 'pt_BR',
      parameters: ['Maria', '25'],
    })).resolves.toEqual(response);

    expect(post).toHaveBeenCalledWith(
      'https://graph.example.test/v99.0/phone-number-123/messages',
      expect.objectContaining({
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: {
          name: 'order_update',
          language: { code: 'pt_BR' },
          components: [{
            type: 'body',
            parameters: [{ type: 'text', text: 'Maria' }, { type: 'text', text: '25' }],
          }],
        },
      }),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${token}` }) }),
    );
  });

  it.each([
    [400, 'bad_request', false],
    [401, 'unauthorized', false],
    [403, 'forbidden', false],
    [404, 'not_found', false],
    [429, 'rate_limited', true],
    [500, 'provider', true],
  ])('maps provider status %i to %s', async (status, kind, retryable) => {
    const error = Object.assign(new Error('provider response'), {
      isAxiosError: true,
      response: { status, data: { error: { code: 131000, type: 'OAuthException', fbtrace_id: 'trace-1' } } },
    });
    jest.spyOn(axios, 'post').mockRejectedValue(error);

    await expect(client.sendText(credentials, input)).rejects.toMatchObject({
      kind,
      statusCode: status,
      providerCode: 131000,
      fbtraceId: 'trace-1',
      retryable,
    });
  });

  it('maps timeout and network failures without exposing provider details', async () => {
    const timeout = Object.assign(new Error('private timeout detail'), { isAxiosError: true, code: 'ECONNABORTED' });
    jest.spyOn(axios, 'post').mockRejectedValueOnce(timeout);
    await expect(client.sendText(credentials, input)).rejects.toMatchObject<Partial<WhatsAppApiError>>({ kind: 'timeout', retryable: true });

    const network = Object.assign(new Error('private network detail'), { isAxiosError: true, code: 'ENETUNREACH' });
    jest.spyOn(axios, 'post').mockRejectedValueOnce(network);
    await expect(client.sendText(credentials, input)).rejects.toMatchObject<Partial<WhatsAppApiError>>({ kind: 'network', retryable: true });
  });

  it('rejects missing credentials or message data before making a request', async () => {
    const post = jest.spyOn(axios, 'post');
    await expect(client.sendText({ phoneNumberId: '', accessToken: token }, input)).rejects.toMatchObject({ kind: 'bad_request', statusCode: 400 });
    await expect(client.sendText(credentials, { to: '', body: '' })).rejects.toMatchObject({ kind: 'bad_request', statusCode: 400 });
    expect(post).not.toHaveBeenCalled();
  });
});
