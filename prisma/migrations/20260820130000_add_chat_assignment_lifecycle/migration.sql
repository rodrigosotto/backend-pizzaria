-- Fase 3: assignment, ciclo de vida e controle otimista de concorrência.
-- Migration aditiva; preserva todas as conversas e mensagens existentes.

CREATE TYPE "ChatConversationStatus" AS ENUM ('open', 'pending', 'closed');
CREATE TYPE "ChatAssignmentStatus" AS ENUM ('unassigned', 'assigned');

ALTER TABLE "chat_conversations"
    ADD COLUMN "status" "ChatConversationStatus" NOT NULL DEFAULT 'open',
    ADD COLUMN "assignment_status" "ChatAssignmentStatus" NOT NULL DEFAULT 'unassigned',
    ADD COLUMN "assigned_to_id" TEXT,
    ADD COLUMN "assigned_at" TIMESTAMP(3),
    ADD COLUMN "assigned_by_id" TEXT,
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "chat_conversations_pizzeria_id_status_idx"
    ON "chat_conversations"("pizzeria_id", "status");
CREATE INDEX "chat_conversations_pizzeria_id_assignment_status_idx"
    ON "chat_conversations"("pizzeria_id", "assignment_status");
CREATE INDEX "chat_conversations_assigned_to_id_idx"
    ON "chat_conversations"("assigned_to_id");

ALTER TABLE "chat_conversations"
    ADD CONSTRAINT "chat_conversations_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chat_conversations"
    ADD CONSTRAINT "chat_conversations_assigned_by_id_fkey"
    FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
