import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../modules/auth/decorators/public.decorator';
import { WhatsAppWebhookService } from './whatsapp.webhook.service';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import type { WhatsAppVerificationQuery } from './whatsapp.webhook.types';

@Public()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly webhookService: WhatsAppWebhookService,
    private readonly inboundService: WhatsAppInboundService,
  ) {}

  @Get()
  verify(@Query() query: WhatsAppVerificationQuery, @Res() reply: FastifyReply): void {
    const mode = query['hub.mode'] ?? query.hub_mode;
    const token = query['hub.verify_token'] ?? query.hub_verify_token;
    const challengeValue = query['hub.challenge'] ?? query.hub_challenge;
    const challenge = this.webhookService.verify(mode, token, challengeValue);
    reply.status(200).type('text/plain').send(challenge);
  }

  @Post()
  async receive(@Req() request: RawBodyRequest<FastifyRequest>, @Res() reply: FastifyReply): Promise<void> {
    const rawBody = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      reply.status(400).send({ received: false });
      return;
    }
    this.webhookService.verifySignature(rawBody, request.headers['x-hub-signature-256']);
    const result = this.webhookService.parseAndRegister(rawBody, request.body);
    let inbound;
    try {
      inbound = result.duplicate
        ? { processed: 0, duplicates: result.messages.length + (result.statuses?.length ?? 0), skipped: 0, statusesUpdated: 0 }
        : await this.inboundService.process(result);
    } catch (error) {
      this.webhookService.releaseRegistration(rawBody, result);
      throw error;
    }
    reply.status(200).send({ received: true, duplicate: result.duplicate, ...inbound });
  }
}
