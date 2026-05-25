import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../modules/audit/audit.service';
import { PrismaService } from '../infra/database/prisma.service';
import { UpsertRecipeDto } from './dto/upsert-recipe.dto';

export type { JwtPayload } from '../modules/auth/auth.service';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async findProductOrThrow(pizzeriaId: string, productId: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id: productId, pizzeriaId },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado nesta pizzaria');
    return product;
  }

  // =========================================================================
  // READ
  // =========================================================================

  /** Retorna a ficha técnica do produto com todos os ingredientes populados (RF76/RF81). */
  async findByProduct(pizzeriaId: string, productId: string) {
    await this.findProductOrThrow(pizzeriaId, productId);

    const ingredients = await this.prisma.db.productRecipe.findMany({
      where: { productId },
      include: {
        stockItem: {
          select: {
            id: true,
            name: true,
            unit: true,
            category: true,
            costPerUnit: true,
            quantity: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      productId,
      ingredientCount: ingredients.length,
      ingredients: ingredients.map((r) => ({
        id: r.id,
        stockItemId: r.stockItemId,
        stockItem: r.stockItem,
        quantity: Number(r.quantity),
        unit: r.unit,
      })),
    };
  }

  // =========================================================================
  // UPSERT — RF76
  // =========================================================================

  /**
   * Cria ou substitui integralmente a ficha técnica do produto (delete + insert atômico).
   * Valida que todos os insumos pertencem à mesma pizzaria antes de persistir.
   */
  async upsertRecipe(
    pizzeriaId: string,
    productId: string,
    dto: UpsertRecipeDto,
    userId: string,
  ) {
    const product = await this.findProductOrThrow(pizzeriaId, productId);

    // Valida que todos os insumos pertencem à pizzaria
    const stockItemIds = dto.ingredients.map((i) => i.stockItemId);
    const foundItems = await this.prisma.db.stockItem.findMany({
      where: { id: { in: stockItemIds }, pizzeriaId },
      select: { id: true },
    });
    if (foundItems.length !== stockItemIds.length) {
      throw new NotFoundException(
        'Um ou mais insumos não foram encontrados nesta pizzaria',
      );
    }

    // Delete + insert atômico
    await this.prisma.db.$transaction(async (tx) => {
      await tx.productRecipe.deleteMany({ where: { productId } });
      await tx.productRecipe.createMany({
        data: dto.ingredients.map((i) => ({
          productId,
          stockItemId: i.stockItemId,
          quantity: new Prisma.Decimal(i.quantity),
          unit: i.unit,
        })),
      });
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'recipe.upsert',
      entity: 'ProductRecipe',
      entityId: productId,
      after: {
        productId,
        productName: product.name,
        ingredientCount: dto.ingredients.length,
      } as Record<string, unknown>,
    });

    return this.findByProduct(pizzeriaId, productId);
  }

  // =========================================================================
  // DELETE
  // =========================================================================

  /** Remove toda a ficha técnica do produto. */
  async deleteRecipe(pizzeriaId: string, productId: string, userId: string) {
    await this.findProductOrThrow(pizzeriaId, productId);

    const { count } = await this.prisma.db.productRecipe.deleteMany({
      where: { productId },
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'recipe.delete',
      entity: 'ProductRecipe',
      entityId: productId,
      before: { productId, removedIngredients: count } as Record<string, unknown>,
    });

    return { deleted: true, removedIngredients: count };
  }

  // =========================================================================
  // STOCK DEDUCTION — RF76
  // =========================================================================

  /**
   * Calcula os débitos de estoque necessários para produzir N unidades do produto.
   * Usado pelo serviço de pedidos ao confirmar um pedido.
   *
   * @param productId UUID do produto
   * @param quantity  Número de unidades produzidas
   * @returns Array de { stockItemId, quantityToDeduct } pronto para movimentação de estoque
   */
  async calculateStockDeduction(
    productId: string,
    quantity: number,
  ): Promise<Array<{ stockItemId: string; quantityToDeduct: number; unit: string }>> {
    const ingredients = await this.prisma.db.productRecipe.findMany({
      where: { productId },
      select: { stockItemId: true, quantity: true, unit: true },
    });

    return ingredients.map((i) => ({
      stockItemId: i.stockItemId,
      quantityToDeduct: Number(i.quantity) * quantity,
      unit: i.unit,
    }));
  }
}
