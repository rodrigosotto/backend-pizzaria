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
  statuses?: WhatsAppStatusUpdate[];
}

export interface WhatsAppWebhookResult extends ParsedWhatsAppWebhook {
  duplicate: boolean;
}

export interface WhatsAppVerificationQuery {
  'hub.mode'?: unknown;
  'hub.verify_token'?: unknown;
  'hub.challenge'?: unknown;
  hub_mode?: unknown;
  hub_verify_token?: unknown;
  hub_challenge?: unknown;
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

export type WhatsAppDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppStatusUpdate {
  businessAccountId: string;
  phoneNumberId: string;
  wamid: string;
  status: WhatsAppDeliveryStatus;
  timestamp: Date;
  recipientId?: string;
  errorCode?: string;
  errorMessage?: string;
}
