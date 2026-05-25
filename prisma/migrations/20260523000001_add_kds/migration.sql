-- CreateEnum: status do item no KDS
CREATE TYPE "KdsItemStatus" AS ENUM ('pending', 'preparing', 'done');

-- CreateTable: fila do Kitchen Display System (RF20–RF27)
CREATE TABLE "kds_items" (
    "id"           TEXT NOT NULL,
    "pizzeria_id"  TEXT NOT NULL,
    "order_id"     TEXT NOT NULL,
    "order_number" INTEGER NOT NULL,
    "product_id"   TEXT NOT NULL,
    "product_name" VARCHAR(100) NOT NULL,
    "quantity"     INTEGER NOT NULL,
    "notes"        TEXT,
    "status"       "KdsItemStatus" NOT NULL DEFAULT 'pending',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at"   TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "kds_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kds_items_pizzeria_id_status_idx" ON "kds_items"("pizzeria_id", "status");
CREATE INDEX "kds_items_pizzeria_id_created_at_idx" ON "kds_items"("pizzeria_id", "created_at");
