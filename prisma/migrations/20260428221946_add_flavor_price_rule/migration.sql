-- CreateEnum
CREATE TYPE "FlavorPriceRule" AS ENUM ('highest', 'average', 'fixed');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "flavor_price_rule" "FlavorPriceRule" NOT NULL DEFAULT 'highest';
