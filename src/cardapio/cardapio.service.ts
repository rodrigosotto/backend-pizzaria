import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { SupabaseStorageService } from '../infra/supabase/supabase-storage.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductSizeDto } from './dto/create-product-size.dto';
import { UpdateProductSizeDto } from './dto/update-product-size.dto';
import { CreateCrustDto } from './dto/create-crust.dto';
import { UpdateCrustDto } from './dto/update-crust.dto';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { UpsertRecipeItemDto } from './dto/product-recipe.dto';
import * as path from 'path';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class CardapioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: SupabaseStorageService,
  ) {}

  // ── Categories ────────────────────────────────────────────────────────────

  async listCategories(pizzeriaId: string) {
    return this.prisma.db.productCategory.findMany({
      where: { pizzeriaId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(pizzeriaId: string, dto: CreateCategoryDto, user: JwtPayload) {
    const existing = await this.prisma.db.productCategory.findUnique({
      where: { pizzeriaId_slug: { pizzeriaId, slug: dto.slug } },
    });
    if (existing) throw new ConflictException('Ja existe uma categoria com este slug');

    const category = await this.prisma.db.productCategory.create({
      data: {
        pizzeriaId,
        name: dto.name,
        slug: dto.slug,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        availableFrom: dto.availableFrom,
        availableTo: dto.availableTo,
      },
    });

    await this.audit.log({
      pizzeriaId,
      userId: user.sub,
      action: 'CATEGORY_CREATED',
      entity: 'ProductCategory',
      entityId: category.id,
      after: category as Record<string, unknown>,
    });

    return category;
  }

  async updateCategory(pizzeriaId: string, categoryId: string, dto: UpdateCategoryDto, user: JwtPayload) {
    const category = await this.findCategoryOrFail(pizzeriaId, categoryId);

    if (dto.slug && dto.slug !== category.slug) {
      const conflict = await this.prisma.db.productCategory.findUnique({
        where: { pizzeriaId_slug: { pizzeriaId, slug: dto.slug } },
      });
      if (conflict) throw new ConflictException('Ja existe uma categoria com este slug');
    }

    const updated = await this.prisma.db.productCategory.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        slug: dto.slug,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        availableFrom: dto.availableFrom,
        availableTo: dto.availableTo,
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'CATEGORY_UPDATED',
      entity: 'ProductCategory', entityId: categoryId,
      before: category as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });

    return updated;
  }

  async removeCategory(pizzeriaId: string, categoryId: string, user: JwtPayload) {
    const category = await this.findCategoryOrFail(pizzeriaId, categoryId);

    const productCount = await this.prisma.db.product.count({ where: { categoryId } });
    if (productCount > 0) {
      throw new ConflictException('Categoria possui produtos vinculados');
    }

    await this.prisma.db.productCategory.delete({ where: { id: categoryId } });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'CATEGORY_DELETED',
      entity: 'ProductCategory', entityId: categoryId,
      before: category as Record<string, unknown>,
    });

    return { message: 'Categoria removida com sucesso' };
  }

  private async findCategoryOrFail(pizzeriaId: string, categoryId: string) {
    const category = await this.prisma.db.productCategory.findFirst({
      where: { id: categoryId, pizzeriaId },
    });
    if (!category) throw new NotFoundException('Categoria nao encontrada');
    return category;
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(pizzeriaId: string, categoryId?: string) {
    return this.prisma.db.product.findMany({
      where: { pizzeriaId, ...(categoryId ? { categoryId } : {}) },
      include: { sizes: { orderBy: { price: 'asc' } }, category: true },
      orderBy: { name: 'asc' },
    });
  }

  async getProduct(pizzeriaId: string, productId: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id: productId, pizzeriaId },
      include: { sizes: { orderBy: { price: 'asc' } }, category: true },
    });
    if (!product) throw new NotFoundException('Produto nao encontrado');
    return product;
  }

  async createProduct(pizzeriaId: string, dto: CreateProductDto, user: JwtPayload) {
    await this.findCategoryOrFail(pizzeriaId, dto.categoryId);

    const product = await this.prisma.db.product.create({
      data: {
        pizzeriaId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        isPizza: dto.isPizza ?? false,
        maxFlavors: dto.maxFlavors,
        flavorPriceRule: dto.flavorPriceRule,
        preparationTime: dto.preparationTime,
        isActive: dto.isActive ?? true,
      },
      include: { sizes: true, category: true },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'PRODUCT_CREATED',
      entity: 'Product', entityId: product.id,
      after: { id: product.id, name: product.name } as Record<string, unknown>,
    });

    return product;
  }

  async updateProduct(pizzeriaId: string, productId: string, dto: UpdateProductDto, user: JwtPayload) {
    const product = await this.getProduct(pizzeriaId, productId);

    if (dto.categoryId) {
      await this.findCategoryOrFail(pizzeriaId, dto.categoryId);
    }

    const updated = await this.prisma.db.product.update({
      where: { id: productId },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        isPizza: dto.isPizza,
        maxFlavors: dto.maxFlavors,
        flavorPriceRule: dto.flavorPriceRule,
        preparationTime: dto.preparationTime,
        isActive: dto.isActive,
      },
      include: { sizes: true, category: true },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'PRODUCT_UPDATED',
      entity: 'Product', entityId: productId,
      before: { id: product.id, name: product.name } as Record<string, unknown>,
      after: { id: updated.id, name: updated.name } as Record<string, unknown>,
    });

    return updated;
  }

  async uploadProductImage(
    pizzeriaId: string,
    productId: string,
    buffer: Buffer,
    originalName: string,
    mimetype: string,
    user: JwtPayload,
  ) {
    await this.getProduct(pizzeriaId, productId);

    const ext = path.extname(originalName) || '.jpg';
    const fileName = `${productId}${ext}`;
    const url = await this.storage.uploadFile('product-images', `${pizzeriaId}/${fileName}`, buffer, mimetype);

    const updated = await this.prisma.db.product.update({
      where: { id: productId },
      data: { imageUrl: url },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'PRODUCT_IMAGE_UPLOADED',
      entity: 'Product', entityId: productId,
      after: { imageUrl: url } as Record<string, unknown>,
    });

    return { imageUrl: updated.imageUrl };
  }

  async removeProduct(pizzeriaId: string, productId: string, user: JwtPayload) {
    const product = await this.getProduct(pizzeriaId, productId);

    await this.prisma.db.product.delete({ where: { id: productId } });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'PRODUCT_DELETED',
      entity: 'Product', entityId: productId,
      before: { id: product.id, name: product.name } as Record<string, unknown>,
    });

    return { message: 'Produto removido com sucesso' };
  }

  // ── Product Sizes ─────────────────────────────────────────────────────────

  async listSizes(pizzeriaId: string, productId: string) {
    await this.getProduct(pizzeriaId, productId);
    return this.prisma.db.productSize.findMany({
      where: { productId },
      orderBy: { price: 'asc' },
    });
  }

  async createSize(pizzeriaId: string, productId: string, dto: CreateProductSizeDto, user: JwtPayload) {
    await this.getProduct(pizzeriaId, productId);

    const size = await this.prisma.db.productSize.create({
      data: {
        productId,
        sizeLabel: dto.sizeLabel,
        price: new Prisma.Decimal(dto.price),
        maxFlavors: dto.maxFlavors,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'PRODUCT_SIZE_CREATED',
      entity: 'ProductSize', entityId: size.id,
      after: size as unknown as Record<string, unknown>,
    });

    return size;
  }

  async updateSize(pizzeriaId: string, productId: string, sizeId: string, dto: UpdateProductSizeDto, user: JwtPayload) {
    await this.getProduct(pizzeriaId, productId);
    const size = await this.findSizeOrFail(productId, sizeId);

    const updated = await this.prisma.db.productSize.update({
      where: { id: sizeId },
      data: {
        sizeLabel: dto.sizeLabel,
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        maxFlavors: dto.maxFlavors,
        isActive: dto.isActive,
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'PRODUCT_SIZE_UPDATED',
      entity: 'ProductSize', entityId: sizeId,
      before: size as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async removeSize(pizzeriaId: string, productId: string, sizeId: string, user: JwtPayload) {
    await this.getProduct(pizzeriaId, productId);
    const size = await this.findSizeOrFail(productId, sizeId);

    await this.prisma.db.productSize.delete({ where: { id: sizeId } });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'PRODUCT_SIZE_DELETED',
      entity: 'ProductSize', entityId: sizeId,
      before: size as unknown as Record<string, unknown>,
    });

    return { message: 'Tamanho removido com sucesso' };
  }

  private async findSizeOrFail(productId: string, sizeId: string) {
    const size = await this.prisma.db.productSize.findFirst({
      where: { id: sizeId, productId },
    });
    if (!size) throw new NotFoundException('Tamanho nao encontrado');
    return size;
  }

  // ── Crusts ────────────────────────────────────────────────────────────────

  async listCrusts(pizzeriaId: string) {
    return this.prisma.db.crust.findMany({
      where: { pizzeriaId },
      orderBy: { name: 'asc' },
    });
  }

  async createCrust(pizzeriaId: string, dto: CreateCrustDto, user: JwtPayload) {
    const crust = await this.prisma.db.crust.create({
      data: {
        pizzeriaId,
        name: dto.name,
        extraPriceS: new Prisma.Decimal(dto.extraPriceS ?? 0),
        extraPriceM: new Prisma.Decimal(dto.extraPriceM ?? 0),
        extraPriceL: new Prisma.Decimal(dto.extraPriceL ?? 0),
        extraPriceXl: new Prisma.Decimal(dto.extraPriceXl ?? 0),
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'CRUST_CREATED',
      entity: 'Crust', entityId: crust.id,
      after: crust as unknown as Record<string, unknown>,
    });

    return crust;
  }

  async updateCrust(pizzeriaId: string, crustId: string, dto: UpdateCrustDto, user: JwtPayload) {
    const crust = await this.findCrustOrFail(pizzeriaId, crustId);

    const updated = await this.prisma.db.crust.update({
      where: { id: crustId },
      data: {
        name: dto.name,
        extraPriceS: dto.extraPriceS !== undefined ? new Prisma.Decimal(dto.extraPriceS) : undefined,
        extraPriceM: dto.extraPriceM !== undefined ? new Prisma.Decimal(dto.extraPriceM) : undefined,
        extraPriceL: dto.extraPriceL !== undefined ? new Prisma.Decimal(dto.extraPriceL) : undefined,
        extraPriceXl: dto.extraPriceXl !== undefined ? new Prisma.Decimal(dto.extraPriceXl) : undefined,
        isActive: dto.isActive,
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'CRUST_UPDATED',
      entity: 'Crust', entityId: crustId,
      before: crust as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async removeCrust(pizzeriaId: string, crustId: string, user: JwtPayload) {
    const crust = await this.findCrustOrFail(pizzeriaId, crustId);

    await this.prisma.db.crust.delete({ where: { id: crustId } });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'CRUST_DELETED',
      entity: 'Crust', entityId: crustId,
      before: crust as unknown as Record<string, unknown>,
    });

    return { message: 'Borda removida com sucesso' };
  }

  private async findCrustOrFail(pizzeriaId: string, crustId: string) {
    const crust = await this.prisma.db.crust.findFirst({
      where: { id: crustId, pizzeriaId },
    });
    if (!crust) throw new NotFoundException('Borda nao encontrada');
    return crust;
  }

  // ── Combos ────────────────────────────────────────────────────────────────

  async listCombos(pizzeriaId: string) {
    return this.prisma.db.combo.findMany({
      where: { pizzeriaId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, isPizza: true } },
            productSize: { select: { id: true, sizeLabel: true, price: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getCombo(pizzeriaId: string, comboId: string) {
    const combo = await this.prisma.db.combo.findFirst({
      where: { id: comboId, pizzeriaId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, isPizza: true } },
            productSize: { select: { id: true, sizeLabel: true, price: true } },
          },
        },
      },
    });
    if (!combo) throw new NotFoundException('Combo nao encontrado');
    return combo;
  }

  async createCombo(pizzeriaId: string, dto: CreateComboDto, user: JwtPayload) {
    // Validate all products belong to this pizzeria
    for (const item of dto.items) {
      await this.getProduct(pizzeriaId, item.productId);
    }

    const combo = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.combo.create({
        data: {
          pizzeriaId,
          name: dto.name,
          description: dto.description,
          price: new Prisma.Decimal(dto.price),
          isActive: dto.isActive ?? true,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validTo: dto.validTo ? new Date(dto.validTo) : null,
        },
      });

      await tx.comboItem.createMany({
        data: dto.items.map((item) => ({
          comboId: created.id,
          productId: item.productId,
          productSizeId: item.productSizeId ?? null,
          quantity: item.quantity ?? 1,
        })),
      });

      return created;
    });

    await this.audit.log({
      pizzeriaId,
      userId: user.sub,
      action: 'COMBO_CREATED',
      entity: 'Combo',
      entityId: combo.id,
      after: { id: combo.id, name: combo.name } as Record<string, unknown>,
    });

    return this.getCombo(pizzeriaId, combo.id);
  }

  async addComboItem(
    pizzeriaId: string,
    comboId: string,
    item: { productId: string; productSizeId?: string; quantity?: number },
    user: JwtPayload,
  ) {
    await this.getCombo(pizzeriaId, comboId);
    await this.getProduct(pizzeriaId, item.productId);

    const created = await this.prisma.db.comboItem.create({
      data: {
        comboId,
        productId: item.productId,
        productSizeId: item.productSizeId ?? null,
        quantity: item.quantity ?? 1,
      },
      include: {
        product: { select: { id: true, name: true } },
        productSize: { select: { id: true, sizeLabel: true, price: true } },
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'COMBO_ITEM_ADDED',
      entity: 'ComboItem', entityId: created.id,
      after: { comboId, productId: item.productId } as Record<string, unknown>,
    });

    return created;
  }

  async removeComboItem(pizzeriaId: string, comboId: string, itemId: string, user: JwtPayload) {
    await this.getCombo(pizzeriaId, comboId);

    const item = await this.prisma.db.comboItem.findFirst({
      where: { id: itemId, comboId },
    });
    if (!item) throw new NotFoundException('Item do combo nao encontrado');

    await this.prisma.db.comboItem.delete({ where: { id: itemId } });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'COMBO_ITEM_REMOVED',
      entity: 'ComboItem', entityId: itemId,
      before: item as unknown as Record<string, unknown>,
    });

    return { message: 'Item removido do combo' };
  }

  async updateCombo(pizzeriaId: string, comboId: string, dto: UpdateComboDto, user: JwtPayload) {
    const combo = await this.getCombo(pizzeriaId, comboId);

    const updated = await this.prisma.db.combo.update({
      where: { id: comboId },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        isActive: dto.isActive,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'COMBO_UPDATED',
      entity: 'Combo', entityId: comboId,
      before: { id: combo.id, name: combo.name } as Record<string, unknown>,
      after: { id: updated.id, name: updated.name } as Record<string, unknown>,
    });

    return this.getCombo(pizzeriaId, comboId);
  }

  async removeCombo(pizzeriaId: string, comboId: string, user: JwtPayload) {
    const combo = await this.getCombo(pizzeriaId, comboId);

    await this.prisma.db.combo.delete({ where: { id: comboId } });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'COMBO_DELETED',
      entity: 'Combo', entityId: comboId,
      before: { id: combo.id, name: combo.name } as Record<string, unknown>,
    });

    return { message: 'Combo removido com sucesso' };
  }

  // ── Product Recipes (ficha técnica) ───────────────────────────────────────

  private async findProductOrThrow(pizzeriaId: string, productId: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id: productId, pizzeriaId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado nesta pizzaria');
    return product;
  }

  async getRecipe(pizzeriaId: string, productId: string) {
    await this.findProductOrThrow(pizzeriaId, productId);

    const items = await this.prisma.db.productRecipe.findMany({
      where: { productId },
      include: {
        stockItem: {
          select: { id: true, name: true, unit: true, category: true, costPerUnit: true, quantity: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      productId,
      items: items.map((r) => ({
        id:        r.id,
        stockItem: r.stockItem,
        quantity:  Number(r.quantity),
      })),
    };
  }

  async upsertRecipeItem(pizzeriaId: string, productId: string, dto: UpsertRecipeItemDto, user: JwtPayload) {
    await this.findProductOrThrow(pizzeriaId, productId);

    // Valida que o insumo pertence à mesma pizzaria
    const stockItem = await this.prisma.db.stockItem.findFirst({
      where: { id: dto.stockItemId, pizzeriaId },
    });
    if (!stockItem) throw new NotFoundException('Insumo não encontrado nesta pizzaria');

    const item = await this.prisma.db.productRecipe.upsert({
      where: { productId_stockItemId: { productId, stockItemId: dto.stockItemId } },
      create: { productId, stockItemId: dto.stockItemId, quantity: dto.quantity },
      update: { quantity: dto.quantity },
      include: {
        stockItem: { select: { id: true, name: true, unit: true, category: true } },
      },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'RECIPE_ITEM_UPSERTED',
      entity: 'ProductRecipe', entityId: item.id,
      after: { productId, stockItemId: dto.stockItemId, quantity: dto.quantity } as Record<string, unknown>,
    });

    return { id: item.id, stockItem: item.stockItem, quantity: Number(item.quantity) };
  }

  async removeRecipeItem(pizzeriaId: string, productId: string, stockItemId: string, user: JwtPayload) {
    await this.findProductOrThrow(pizzeriaId, productId);

    const item = await this.prisma.db.productRecipe.findUnique({
      where: { productId_stockItemId: { productId, stockItemId } },
    });
    if (!item) throw new NotFoundException('Ingrediente não encontrado na receita deste produto');

    await this.prisma.db.productRecipe.delete({
      where: { productId_stockItemId: { productId, stockItemId } },
    });

    await this.audit.log({
      pizzeriaId, userId: user.sub, action: 'RECIPE_ITEM_REMOVED',
      entity: 'ProductRecipe', entityId: item.id,
      before: { productId, stockItemId, quantity: Number(item.quantity) } as Record<string, unknown>,
    });

    return { message: 'Ingrediente removido da receita' };
  }

}