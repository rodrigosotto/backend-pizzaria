import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';
import { CardapioService } from './cardapio.service';
import type { JwtPayload } from './cardapio.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Cardápio — Categorias')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'ID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão (role insuficiente ou sem vínculo com a pizzaria)' })
@Controller('menu/categories')
@RequiresPizzeria()
export class CategoriesController {
  constructor(private readonly cardapioService: CardapioService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Listar categorias do cardápio',
    description: 'Retorna todas as categorias da pizzaria ordenadas por `sortOrder` e depois por nome. Inclui categorias ativas e inativas.',
  })
  @ApiResponse({ status: 200, description: 'Lista de categorias ordenadas por sortOrder' })
  listCategories(@CurrentPizzeria() pizzeriaId: string) {
    return this.cardapioService.listCategories(pizzeriaId);
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Criar categoria',
    description: 'Cria uma nova categoria no cardápio. O `slug` deve ser único dentro da pizzaria e seguir o formato kebab-case (ex: `pizzas-tradicionais`). Os campos `availableFrom` e `availableTo` (formato HH:MM) limitam o horário em que a categoria aparece no cardápio público (RF18).',
  })
  @ApiResponse({ status: 201, description: 'Categoria criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (slug fora do formato, horário inválido, etc.)' })
  @ApiResponse({ status: 409, description: 'Já existe uma categoria com este slug nesta pizzaria' })
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.createCategory(pizzeriaId, dto, user);
  }

  @Patch(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Atualizar categoria',
    description: 'Atualiza parcialmente os dados de uma categoria. Ao alterar o `slug`, o sistema verifica unicidade antes de salvar.',
  })
  @ApiParam({ name: 'id', description: 'UUID da categoria' })
  @ApiResponse({ status: 200, description: 'Categoria atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada nesta pizzaria' })
  @ApiResponse({ status: 409, description: 'Slug já em uso por outra categoria' })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.updateCategory(pizzeriaId, id, dto, user);
  }

  @Delete(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover categoria',
    description: 'Remove a categoria permanentemente. A operação é bloqueada se houver produtos vinculados — remova ou mova os produtos antes.',
  })
  @ApiParam({ name: 'id', description: 'UUID da categoria' })
  @ApiResponse({ status: 200, description: 'Categoria removida com sucesso' })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada nesta pizzaria' })
  @ApiResponse({ status: 409, description: 'Categoria possui produtos vinculados — remova os produtos antes' })
  removeCategory(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.removeCategory(pizzeriaId, id, user);
  }
}
