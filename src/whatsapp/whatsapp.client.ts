import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { WhatsAppApiError, WhatsAppErrorKind } from './whatsapp.errors';
import { MetaApiErrorPayload, SendTemplateMessageInput, SendTextMessageInput, WhatsAppCredentials, WhatsAppSendTemplateResponse, WhatsAppSendTextResponse } from './whatsapp.types';

@Injectable()
export class WhatsAppClient {
  private readonly logger = new Logger(WhatsAppClient.name);
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('WHATSAPP_GRAPH_API_BASE_URL', 'https://graph.facebook.com').replace(/\/+$/, '');
    this.apiVersion = this.configService.get<string>('WHATSAPP_GRAPH_API_VERSION', 'v20.0').replace(/^\/+|\/+$/g, '');
    const configuredTimeout = Number(this.configService.get<string>('WHATSAPP_HTTP_TIMEOUT_MS', '10000'));
    this.timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 10000;
  }

  async sendText(credentials: WhatsAppCredentials, input: SendTextMessageInput): Promise<WhatsAppSendTextResponse> {
    this.validateInput(credentials, input);
    const url = `${this.baseUrl}/${this.apiVersion}/${encodeURIComponent(credentials.phoneNumberId)}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'text',
      text: { body: input.body, preview_url: input.previewUrl ?? false },
    };

    this.logger.debug(`Sending WhatsApp text via ${this.apiVersion} for phone number ${credentials.phoneNumberId}`);
    try {
      const response = await axios.post<WhatsAppSendTextResponse>(url, payload, {
        timeout: this.timeoutMs,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.accessToken}`,
        },
      });
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async sendTemplate(
    credentials: WhatsAppCredentials,
    input: SendTemplateMessageInput,
  ): Promise<WhatsAppSendTemplateResponse> {
    this.validateInput(credentials, input);
    const url = `${this.baseUrl}/${this.apiVersion}/${encodeURIComponent(credentials.phoneNumberId)}/messages`;
    const components = input.parameters?.length
      ? [{ type: 'body', parameters: input.parameters.map((text) => ({ type: 'text', text })) }]
      : undefined;
    const payload = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'template',
      template: {
        name: input.name,
        language: { code: input.language },
        ...(components ? { components } : {}),
      },
    };

    this.logger.debug(`Sending WhatsApp template via ${this.apiVersion} for phone number ${credentials.phoneNumberId}`);
    try {
      const response = await axios.post<WhatsAppSendTemplateResponse>(url, payload, {
        timeout: this.timeoutMs,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.accessToken}`,
        },
      });
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private validateInput(credentials: WhatsAppCredentials, input: SendTextMessageInput | SendTemplateMessageInput): void {
    if (!credentials.phoneNumberId?.trim() || !credentials.accessToken?.trim()) {
      throw new WhatsAppApiError('bad_request', 'WhatsApp credentials are required', 400);
    }
    if (!input.to?.trim()) {
      throw new WhatsAppApiError('bad_request', 'WhatsApp recipient and message body are required', 400);
    }
    if ('body' in input && !input.body?.trim()) {
      throw new WhatsAppApiError('bad_request', 'WhatsApp recipient and message body are required', 400);
    }
    if ('name' in input && (!input.name?.trim() || !input.language?.trim())) {
      throw new WhatsAppApiError('bad_request', 'WhatsApp template name and language are required', 400);
    }
  }

  private mapError(error: unknown): WhatsAppApiError {
    if (!axios.isAxiosError(error)) return new WhatsAppApiError('unknown', 'Unexpected WhatsApp client error');
    const axiosError = error as AxiosError<MetaApiErrorPayload>;
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      this.logger.warn(`WhatsApp Graph API request timed out after ${this.timeoutMs}ms`);
      return new WhatsAppApiError('timeout', 'WhatsApp Graph API request timed out', undefined, undefined, undefined, undefined, true);
    }
    if (!axiosError.response) {
      this.logger.warn('WhatsApp Graph API network request failed');
      return new WhatsAppApiError('network', 'Unable to reach WhatsApp Graph API', undefined, undefined, undefined, undefined, true);
    }
    const statusCode = axiosError.response.status;
    const providerError = axiosError.response.data?.error;
    const kind = this.mapStatus(statusCode);
    this.logger.warn(`WhatsApp Graph API returned status ${statusCode} (${kind})`);
    return new WhatsAppApiError(kind, this.messageForKind(kind), statusCode, providerError?.code, providerError?.type, providerError?.fbtrace_id, kind === 'rate_limited' || kind === 'provider');
  }

  private mapStatus(statusCode: number): WhatsAppErrorKind {
    if (statusCode === 400) return 'bad_request';
    if (statusCode === 401) return 'unauthorized';
    if (statusCode === 403) return 'forbidden';
    if (statusCode === 404) return 'not_found';
    if (statusCode === 429) return 'rate_limited';
    if (statusCode >= 500) return 'provider';
    return 'unknown';
  }

  private messageForKind(kind: WhatsAppErrorKind): string {
    const messages: Record<WhatsAppErrorKind, string> = {
      bad_request: 'WhatsApp Graph API rejected the request',
      unauthorized: 'WhatsApp Graph API credentials were rejected',
      forbidden: 'WhatsApp Graph API denied access to the resource',
      not_found: 'WhatsApp Graph API resource was not found',
      rate_limited: 'WhatsApp Graph API rate limit was exceeded',
      provider: 'WhatsApp Graph API is unavailable',
      timeout: 'WhatsApp Graph API request timed out',
      network: 'Unable to reach WhatsApp Graph API',
      unknown: 'WhatsApp Graph API request failed',
    };
    return messages[kind];
  }
}
