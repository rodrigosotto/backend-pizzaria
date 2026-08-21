-- Fase 2: modelo de dados para futura integração WhatsApp.
-- Migration exclusivamente aditiva; não remove nem reescreve registros existentes.

CREATE TYPE "WhatsAppAccountStatus" AS ENUM ('pending', 'active', 'suspended', 'inactive');
CREATE TYPE "ChatChannel" AS ENUM ('internal', 'whatsapp');
CREATE TYPE "ChatMessageDirection" AS ENUM ('inbound', 'outbound');
CREATE TYPE "ChatMessageType" AS ENUM ('text', 'image', 'audio', 'video', 'document', 'location', 'sticker', 'reaction', 'template', 'unknown');
CREATE TYPE "ChatMessageStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "pizzeria_id" TEXT NOT NULL,
    "business_account_id" VARCHAR(255),
    "phone_number_id" VARCHAR(255) NOT NULL,
    "meta_app_id" VARCHAR(255),
    "status" "WhatsAppAccountStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "chat_conversations"
    ADD COLUMN "whatsapp_account_id" TEXT,
    ADD COLUMN "channel" "ChatChannel" NOT NULL DEFAULT 'internal';

ALTER TABLE "chat_messages"
    ADD COLUMN "channel" "ChatChannel" NOT NULL DEFAULT 'internal',
    ADD COLUMN "direction" "ChatMessageDirection" NOT NULL DEFAULT 'outbound',
    ADD COLUMN "message_type" "ChatMessageType" NOT NULL DEFAULT 'text',
    ADD COLUMN "external_message_id" VARCHAR(255),
    ADD COLUMN "wamid" VARCHAR(255),
    ADD COLUMN "status" "ChatMessageStatus" NOT NULL DEFAULT 'sent',
    ADD COLUMN "status_updated_at" TIMESTAMP(3),
    ADD COLUMN "error_code" VARCHAR(100),
    ADD COLUMN "error_message" VARCHAR(500),
    ADD COLUMN "external_timestamp" TIMESTAMP(3),
    ADD COLUMN "media_id" VARCHAR(255);

-- Preserva a semântica dos registros internos já existentes.
UPDATE "chat_messages"
SET "direction" = 'inbound'
WHERE "sender_type" = 'customer';

CREATE UNIQUE INDEX "whatsapp_accounts_pizzeria_id_key"
    ON "whatsapp_accounts"("pizzeria_id");
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_key"
    ON "whatsapp_accounts"("phone_number_id");
CREATE INDEX "whatsapp_accounts_status_idx"
    ON "whatsapp_accounts"("status");

CREATE UNIQUE INDEX "chat_messages_wamid_key"
    ON "chat_messages"("wamid");
CREATE INDEX "chat_messages_external_message_id_idx"
    ON "chat_messages"("external_message_id");
CREATE INDEX "chat_messages_conversation_id_created_at_idx"
    ON "chat_messages"("conversation_id", "created_at");
CREATE INDEX "chat_messages_conversation_id_status_idx"
    ON "chat_messages"("conversation_id", "status");
CREATE INDEX "chat_messages_channel_status_idx"
    ON "chat_messages"("channel", "status");

CREATE INDEX "chat_conversations_pizzeria_id_channel_idx"
    ON "chat_conversations"("pizzeria_id", "channel");
CREATE INDEX "chat_conversations_pizzeria_id_last_message_at_idx"
    ON "chat_conversations"("pizzeria_id", "last_message_at");
CREATE INDEX "chat_conversations_whatsapp_account_id_idx"
    ON "chat_conversations"("whatsapp_account_id");

CREATE TABLE "chat_message_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "media_id" VARCHAR(255),
    "file_name" VARCHAR(255),
    "mime_type" VARCHAR(100),
    "file_size" INTEGER,
    "storage_path" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_message_attachments_message_id_idx"
    ON "chat_message_attachments"("message_id");
CREATE INDEX "chat_message_attachments_media_id_idx"
    ON "chat_message_attachments"("media_id");

ALTER TABLE "whatsapp_accounts"
    ADD CONSTRAINT "whatsapp_accounts_pizzeria_id_fkey"
    FOREIGN KEY ("pizzeria_id") REFERENCES "pizzerias"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_conversations"
    ADD CONSTRAINT "chat_conversations_whatsapp_account_id_fkey"
    FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chat_message_attachments"
    ADD CONSTRAINT "chat_message_attachments_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
