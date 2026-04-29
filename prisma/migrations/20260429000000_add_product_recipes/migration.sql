-- CreateTable: product_recipes (ficha técnica — vínculo produto → insumo)
CREATE TABLE "product_recipes" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "product_id"    UUID        NOT NULL,
    "stock_item_id" UUID        NOT NULL,
    "quantity"      DECIMAL(10,3) NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "product_recipes_pkey" PRIMARY KEY ("id")
);

-- UniqueConstraint: um produto não pode ter o mesmo insumo duas vezes
CREATE UNIQUE INDEX "product_recipes_product_id_stock_item_id_key"
    ON "product_recipes"("product_id", "stock_item_id");

-- ForeignKey: product_id → products.id (cascade delete)
ALTER TABLE "product_recipes"
    ADD CONSTRAINT "product_recipes_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ForeignKey: stock_item_id → stock_items.id
ALTER TABLE "product_recipes"
    ADD CONSTRAINT "product_recipes_stock_item_id_fkey"
    FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_recipes_updated_at
  BEFORE UPDATE ON "product_recipes"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
