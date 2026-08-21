-- Additive delivery queue fields. Existing messages remain compatible.
ALTER TYPE "ChatMessageStatus" ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE "chat_messages"
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "next_attempt_at" TIMESTAMP(3),
    ADD COLUMN "processing_started_at" TIMESTAMP(3),
    ADD COLUMN "correlation_id" VARCHAR(100),
    ADD COLUMN "delivery_payload" JSONB;

CREATE UNIQUE INDEX "chat_messages_correlation_id_key"
    ON "chat_messages"("correlation_id");

CREATE INDEX "chat_messages_status_next_attempt_at_idx"
    ON "chat_messages"("status", "next_attempt_at");
