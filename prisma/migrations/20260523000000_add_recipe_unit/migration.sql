-- AlterTable: adiciona coluna unit à tabela product_recipes (RF76 - ficha técnica com unidade)
ALTER TABLE "product_recipes" ADD COLUMN "unit" VARCHAR(10) NOT NULL DEFAULT 'un';

-- Ajusta precisão de quantity de Decimal(10,3) para Decimal(10,4)
ALTER TABLE "product_recipes" ALTER COLUMN "quantity" TYPE DECIMAL(10,4);
