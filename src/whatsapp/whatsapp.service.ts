import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppClient } from './whatsapp.client';
import { WhatsAppApiError } from './whatsapp.errors';
import { SendTemplateMessageInput, SendTextMessageInput, WhatsAppCredentials, WhatsAppSendTemplateResponse, WhatsAppSendTextResponse } from './whatsapp.types';

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly whatsappClient: WhatsAppClient,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  sendText(credentials: WhatsAppCredentials, input: SendTextMessageInput): Promise<WhatsAppSendTextResponse> {
    return this.whatsappClient.sendText(credentials, input);
  }

  sendTemplate(credentials: WhatsAppCredentials, input: SendTemplateMessageInput): Promise<WhatsAppSendTemplateResponse> {
    return this.whatsappClient.sendTemplate(credentials, input);
  }

  sendTextForAccount(
    account: { phoneNumberId: string },
    input: SendTextMessageInput,
  ): Promise<WhatsAppSendTextResponse> {
    const accessToken = this.configService?.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!accessToken) {
      return Promise.reject(new WhatsAppApiError('unauthorized', 'WhatsApp access token is not configured', 401));
    }
    return this.sendText({ phoneNumberId: account.phoneNumberId, accessToken }, input);
  }

  sendTemplateForAccount(
    account: { phoneNumberId: string },
    input: SendTemplateMessageInput,
  ): Promise<WhatsAppSendTemplateResponse> {
    const accessToken = this.configService?.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!accessToken) {
      return Promise.reject(new WhatsAppApiError('unauthorized', 'WhatsApp access token is not configured', 401));
    }
    return this.sendTemplate({ phoneNumberId: account.phoneNumberId, accessToken }, input);
  }

  isWithinServiceWindow(lastInboundAt: Date | null): boolean {
    if (!lastInboundAt) return false;
    const configuredHours = Number(this.configService?.get<string>('WHATSAPP_SERVICE_WINDOW_HOURS', '24'));
    const hours = Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 24;
    return Date.now() - lastInboundAt.getTime() <= hours * 60 * 60 * 1000;
  }
}
