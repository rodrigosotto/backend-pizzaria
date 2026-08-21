export interface WhatsAppWebhookPayload {
  object: unknown;
  entry: unknown;
}

export interface ParsedWhatsAppWebhook {
  entryCount: number;
  changeCount: number;
  messageIds: string[];
  statusIds: string[];
  messages: WhatsAppInboundMessage[];
}

export interface WhatsAppWebhookResult extends ParsedWhatsAppWebhook {
  duplicate: boolean;
}

export interface WhatsAppVerificationQuery {
  'hub.mode'?: unknown;
  'hub.verify_token'?: unknown;
  'hub.challenge'?: unknown;
}

export interface WhatsAppInboundMessage {
  businessAccountId: string;
  phoneNumberId: string;
  wamid: string;
  from: string;
  timestamp: Date;
  type: 'text';
  text: string;
  profileName?: string;
}
