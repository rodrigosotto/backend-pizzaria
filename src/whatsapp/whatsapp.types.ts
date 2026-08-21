export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface SendTextMessageInput {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface SendTemplateMessageInput {
  to: string;
  name: string;
  language: string;
  parameters?: string[];
}

export interface WhatsAppSendTextResponse {
  messaging_product: 'whatsapp';
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
}

export type WhatsAppSendTemplateResponse = WhatsAppSendTextResponse;

export interface MetaApiErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}
