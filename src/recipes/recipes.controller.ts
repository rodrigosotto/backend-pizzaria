import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PizzeriaUserRole } from '@prisma/client';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';
import type { JwtPayload } from './recipes.service';
import { RecipesService } from './recipes.service';
import { UpsertRecipeDto } from './dto/upsert-recipe.dto';

@ApiTags('Receitas (Ficha Técnica)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão' })
@Controller('recipes')
@RequiresPizzeria()
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  // ── GET /recipes/:productId ────────────────────────────────────────────────

  @Get(':productId')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Buscar ficha técnica do produto (RF76/RF81)',
    description:
      'Retorna todos os ingredientes vinculados ao produto com quantidade consumida por unidade e dados do insumo de estoque. ' +
      'Usado para visualização da receita e para cálculo de baixa automática ao confirmar pedidos (RF76).',
  })
  @ApiParam({ name: 'productId', description: 'UUID do produto' })
  @ApiResponse({
    status: 200,
    description: 'Ficha técnica do produto',
    schema: {
      example: {
        productId: 'uuid-pizza-margherita',
        ingredientCount: 3,
        ingredients: [
          {
            id: 'uuid-recipe-item-1',
            stockItemId: 'uuid-farinha',
            stockItem: { id: 'uuid-farinha', name: 'Farinha de Trigo', unit: 'kg', category: 'outros' },
            quantity: 0.25,
            unit: 'kg',
          },
          {
            id: 'uuid-recipe-item-2',
            stockItemId: 'uuid-molho',
            stockItem: { id: 'uuid-molho', name: 'Molho de Tomate', unit: 'kg', category: 'outros' },
            quantity: 0.08,
            unit: 'kg',
          },
          {
            id: 'uuid-recipe-item-3',
            stockItemId: 'uuid-queijo',
            stockItem: { id: 'uuid-queijo', name: 'Muçarela', unit: 'kg', category: 'frios' },
            quantity: 0.15,
            unit: 'kg',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Produto não encontrado nesta pizzaria' })
  findByProduct(
    @Param('productId') productId: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.recipesService.findByProduct(pizzeriaId, productId);
  }

  // ── PUT /recipes/:productId ────────────────────────────────────────────────

  @Put(':productId')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Criar ou substituir ficha técnica (RF76)',
    description:
      'Cria ou substitui integralmente a ficha técnica do produto de forma atômica: ' +
      'remove todos os ingredientes existentes e insere os novos em uma única transação. ' +
      'Todos os insumos informados devem pertencer à mesma pizzaria.\n\n' +
      '**Exemplo — Pizza Margherita:**\n' +
      '- 250g de Farinha de Trigo (`quantity: 0.25, unit: "kg"`)\n' +
      '- 80g de Molho de Tomate (`quantity: 0.08, unit: "kg"`)\n' +
      '- 150g de Muçarela (`quantity: 0.15, unit: "kg"`)',
  })
  @ApiParam({ name: 'productId', description: 'UUID do produto' })
  @ApiResponse({ status: 200, description: 'Ficha técnica criada/atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (lista de ingredientes vazia ou campos ausentes)' })
  @ApiResponse({ status: 404, description: 'Produto ou insumo não encontrado nesta pizzaria' })
  upsertRecipe(
    @Param('productId') productId: string,
    @Body() dto: UpsertRecipeDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.recipesService.upsertRecipe(pizzeriaId, productId, dto, user.sub);
  }

  // ── DELETE /recipes/:productId ─────────────────────────────────────────────

  @Delete(':productId')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover ficha técnica do produto',
    description:
      'Remove integralmente a ficha técnica do produto. ' +
      'O produto continua existindo no cardápio, mas sem receita vinculada a baixa automática de estoque (RF76) não será aplicada.',
  })
  @ApiParam({ name: 'productId', description: 'UUID do produto' })
  @ApiResponse({
    status: 200,
    description: 'Ficha técnica removida',
    schema: { example: { deleted: true, removedIngredients: 3 } },
  })
  @ApiResponse({ status: 404, description: 'Produto não encontrado nesta pizzaria' })
  deleteRecipe(
    @Param('productId') productId: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.recipesService.deleteRecipe(pizzeriaId, productId, user.sub);
  }
}
