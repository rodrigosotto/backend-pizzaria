import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppClient } from './whatsapp.client';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WhatsAppWebhookService } from './whatsapp.webhook.service';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import { ChatGateway } from '../chat/chat.gateway';
import { AuthModule } from '../modules/auth/auth.module';
import { WhatsAppDeliveryQueueService } from './whatsapp.delivery.queue';
import { WhatsAppDeliveryWorker } from './whatsapp.delivery.worker';
import { WhatsAppAccountController } from './whatsapp-account.controller';
import { WhatsAppAccountService } from './whatsapp-account.service';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [WhatsAppWebhookController, WhatsAppAccountController],
  providers: [WhatsAppClient, WhatsAppService, WhatsAppWebhookService, WhatsAppInboundService, WhatsAppDeliveryQueueService, WhatsAppDeliveryWorker, WhatsAppAccountService, ChatGateway],
  exports: [WhatsAppService, WhatsAppDeliveryQueueService, ChatGateway],
})
export class WhatsAppModule {}
