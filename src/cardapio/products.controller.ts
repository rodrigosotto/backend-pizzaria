import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PizzeriaUserRole } from '@prisma/client';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';
import { CardapioService } from './cardapio.service';
import type { JwtPayload } from './cardapio.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductSizeDto } from './dto/create-product-size.dto';
import { UpdateProductSizeDto } from './dto/update-product-size.dto';
import { UpsertRecipeItemDto } from './dto/product-recipe.dto';

@ApiTags('Cardápio — Produtos')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'ID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão (role insuficiente ou sem vínculo com a pizzaria)' })
@Controller('menu/products')
@RequiresPizzeria()
export class ProductsController {
  constructor(private readonly cardapioService: CardapioService) {}

  // ── Products ──────────────────────────────────────────────────────────────

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Listar produtos do cardápio',
    description: 'Retorna todos os produtos da pizzaria com seus tamanhos e categoria. Use `?categoryId=` para filtrar por categoria.',
  })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filtrar por UUID da categoria' })
  @ApiResponse({ status: 200, description: 'Lista de produtos com tamanhos e categoria incluídos' })
  listProducts(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.cardapioService.listProducts(pizzeriaId, categoryId);
  }

  @Get(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Buscar produto por ID',
    description: 'Retorna o produto com todos os tamanhos ativos e a categoria vinculada.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiResponse({ status: 200, description: 'Produto com tamanhos e categoria' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado nesta pizzaria' })
  getProduct(@Param('id') id: string, @CurrentPizzeria() pizzeriaId: string) {
    return this.cardapioService.getProduct(pizzeriaId, id);
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Criar produto',
    description: 'Cria um produto no cardápio. Para pizzas, defina `isPizza: true` e `maxFlavors`. O campo `flavorPriceRule` determina como o preço é calculado quando o cliente escolhe múltiplos sabores (RN01): `highest` = sabor mais caro (padrão), `average` = média, `fixed` = preço fixo do tamanho.',
  })
  @ApiResponse({ status: 201, description: 'Produto criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (categoria inexistente, campos obrigatórios ausentes)' })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada nesta pizzaria' })
  createProduct(
    @Body() dto: CreateProductDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.createProduct(pizzeriaId, dto, user);
  }

  @Patch(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Atualizar produto',
    description: 'Atualiza parcialmente os dados do produto. Para mover o produto de categoria, informe o novo `categoryId` — o sistema valida se a categoria pertence à pizzaria.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiResponse({ status: 200, description: 'Produto atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Produto ou categoria não encontrada nesta pizzaria' })
  updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.updateProduct(pizzeriaId, id, dto, user);
  }

  @Post(':id/image')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload de imagem do produto',
    description: 'Faz upload da imagem para o Supabase Storage (bucket `product-images`) e atualiza o campo `imageUrl` do produto. Enviar como `multipart/form-data` com o campo `file`.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Imagem do produto (JPG, PNG, WebP)' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Imagem enviada com sucesso — retorna { imageUrl }' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado nesta pizzaria' })
  async uploadImage(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    const data = await req.file();
    if (!data) throw new InternalServerErrorException('Nenhum arquivo enviado');
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) { chunks.push(chunk as Buffer); }
    return this.cardapioService.uploadProductImage(
      pizzeriaId, id, Buffer.concat(chunks), data.filename, data.mimetype, user,
    );
  }

  @Delete(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover produto',
    description: 'Remove o produto permanentemente junto com todos os seus tamanhos.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiResponse({ status: 200, description: 'Produto removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado nesta pizzaria' })
  removeProduct(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.removeProduct(pizzeriaId, id, user);
  }

  // ── Sizes ─────────────────────────────────────────────────────────────────

  @Get(':id/sizes')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Listar tamanhos do produto',
    description: 'Retorna todos os tamanhos do produto ordenados por preço crescente.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiResponse({ status: 200, description: 'Lista de tamanhos ordenados por preço' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado nesta pizzaria' })
  listSizes(@Param('id') id: string, @CurrentPizzeria() pizzeriaId: string) {
    return this.cardapioService.listSizes(pizzeriaId, id);
  }

  @Post(':id/sizes')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Adicionar tamanho ao produto',
    description: 'Adiciona um novo tamanho ao produto (ex: Grande 35cm — R$ 49,90). O `maxFlavors` aqui sobrescreve o do produto para este tamanho específico.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiResponse({ status: 201, description: 'Tamanho adicionado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (preço negativo, sizeLabel muito longo, etc.)' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado nesta pizzaria' })
  createSize(
    @Param('id') id: string,
    @Body() dto: CreateProductSizeDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.createSize(pizzeriaId, id, dto, user);
  }

  @Patch(':id/sizes/:sizeId')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Atualizar tamanho',
    description: 'Atualiza parcialmente um tamanho do produto. Útil para reajustes de preço sem recriar o tamanho.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiParam({ name: 'sizeId', description: 'UUID do tamanho' })
  @ApiResponse({ status: 200, description: 'Tamanho atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Produto ou tamanho não encontrado' })
  updateSize(
    @Param('id') id: string,
    @Param('sizeId') sizeId: string,
    @Body() dto: UpdateProductSizeDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.updateSize(pizzeriaId, id, sizeId, dto, user);
  }

  @Delete(':id/sizes/:sizeId')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover tamanho',
    description: 'Remove um tamanho do produto. Prefira desativar (`isActive: false`) para preservar histórico de pedidos.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiParam({ name: 'sizeId', description: 'UUID do tamanho' })
  @ApiResponse({ status: 200, description: 'Tamanho removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Produto ou tamanho não encontrado' })
  removeSize(
    @Param('id') id: string,
    @Param('sizeId') sizeId: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.removeSize(pizzeriaId, id, sizeId, user);
  }

  // ── Recipe (ficha técnica) ─────────────────────────────────────────────────

  @Get(':id/recipe')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Ficha técnica do produto (RF76/RF81)',
    description: 'Retorna todos os insumos vinculados a este produto com a quantidade consumida por unidade. Usado para baixa automática de estoque ao confirmar pedido (RF76).',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiResponse({ status: 200, description: 'Lista de ingredientes da receita' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado' })
  getRecipe(@Param('id') id: string, @CurrentPizzeria() pizzeriaId: string) {
    return this.cardapioService.getRecipe(pizzeriaId, id);
  }

  @Post(':id/recipe')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Adicionar/atualizar ingrediente na ficha técnica',
    description: 'Vincula um insumo de estoque ao produto com a quantidade consumida por unidade. Se o insumo já existir na receita, atualiza a quantidade (upsert).',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiResponse({ status: 201, description: 'Ingrediente adicionado/atualizado na receita' })
  @ApiResponse({ status: 404, description: 'Produto ou insumo não encontrado nesta pizzaria' })
  upsertRecipeItem(
    @Param('id') id: string,
    @Body() dto: UpsertRecipeItemDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.upsertRecipeItem(pizzeriaId, id, dto, user);
  }

  @Delete(':id/recipe/:stockItemId')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover ingrediente da ficha técnica',
    description: 'Remove o vínculo entre o produto e o insumo de estoque.',
  })
  @ApiParam({ name: 'id', description: 'UUID do produto' })
  @ApiParam({ name: 'stockItemId', description: 'UUID do insumo de estoque' })
  @ApiResponse({ status: 200, description: 'Ingrediente removido da receita' })
  @ApiResponse({ status: 404, description: 'Ingrediente não encontrado na receita' })
  removeRecipeItem(
    @Param('id') id: string,
    @Param('stockItemId') stockItemId: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.removeRecipeItem(pizzeriaId, id, stockItemId, user);
  }
}
