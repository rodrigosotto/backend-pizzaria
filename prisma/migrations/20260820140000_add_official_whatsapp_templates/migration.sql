-- Fase 10: templates oficiais da WhatsApp Business Platform.
-- Migration aditiva; ChatTemplate (quick reply interna) permanece inalterado.

CREATE TYPE "WhatsAppTemplateCategory" AS ENUM ('marketing', 'utility', 'authentication');
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('pending', 'approved', 'rejected', 'paused', 'disabled');

CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "pizzeria_id" TEXT NOT NULL,
    "whatsapp_account_id" TEXT NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "language" VARCHAR(35) NOT NULL,
    "category" "WhatsAppTemplateCategory" NOT NULL,
    "status" "WhatsAppTemplateStatus" NOT NULL DEFAULT 'pending',
    "external_id" VARCHAR(255),
    "parameter_count" INTEGER NOT NULL DEFAULT 0,
    "components" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_templates_whatsapp_account_id_name_language_key"
    ON "whatsapp_templates"("whatsapp_account_id", "name", "language");
CREATE INDEX "whatsapp_templates_pizzeria_id_status_idx"
    ON "whatsapp_templates"("pizzeria_id", "status");
CREATE INDEX "whatsapp_templates_whatsapp_account_id_status_idx"
    ON "whatsapp_templates"("whatsapp_account_id", "status");

ALTER TABLE "whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_pizzeria_id_fkey"
    FOREIGN KEY ("pizzeria_id") REFERENCES "pizzerias"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_whatsapp_account_id_fkey"
    FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
