import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StockCategory, PizzeriaUserRole } from '@prisma/client';
import type { JwtPayload } from './estoque.service';
import { EstoqueService } from './estoque.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';

@ApiTags('Estoque — Insumos')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão' })
@Controller('stock')
@RequiresPizzeria()
export class StockItemsController {
  constructor(private readonly estoqueService: EstoqueService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente, PizzeriaUserRole.cozinha)
  @ApiOperation({
    summary: 'Listar insumos do estoque (RF72/RF73)',
    description: 'Retorna insumos com flag `isAlert` indicando se quantity ≤ minQuantity (RN04). Filtrável por categoria, fornecedor ou apenas alertas.',
  })
  @ApiQuery({ name: 'category', enum: StockCategory, required: false })
  @ApiQuery({ name: 'supplierId', required: false, description: 'UUID do fornecedor' })
  @ApiQuery({ name: 'alertOnly', required: false, type: Boolean, description: 'Apenas insumos abaixo do mínimo (RF74)' })
  @ApiResponse({ status: 200, description: 'Lista de insumos' })
  findAll(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('category') category?: StockCategory,
    @Query('supplierId') supplierId?: string,
    @Query('alertOnly') alertOnly?: string,
  ) {
    return this.estoqueService.listStockItems(pizzeriaId, {
      category,
      supplierId,
      alertOnly: alertOnly === 'true',
    });
  }

  @Get('alerts')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Insumos abaixo do estoque mínimo (RF74/RN04)',
    description: 'Retorna apenas insumos com quantity ≤ minQuantity, ordenados pelo percentual mais crítico (menor quantidade relativa primeiro). Usado para alertas no painel e no Hub.',
  })
  @ApiResponse({ status: 200, description: 'Lista de alertas de estoque ordenados por criticidade' })
  getAlerts(@CurrentPizzeria() pizzeriaId: string) {
    return this.estoqueService.listAlerts(pizzeriaId);
  }

  @Get(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente, PizzeriaUserRole.cozinha)
  @ApiOperation({
    summary: 'Buscar insumo por ID',
    description: 'Retorna insumo com fornecedor e últimas 50 movimentações.',
  })
  @ApiParam({ name: 'id', description: 'UUID do insumo' })
  @ApiResponse({ status: 200, description: 'Insumo com histórico' })
  @ApiResponse({ status: 404, description: 'Insumo não encontrado' })
  findOne(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.estoqueService.getStockItem(pizzeriaId, id);
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Cadastrar insumo (RF72)',
    description: 'Cadastra insumo com categoria, unidade de medida e estoque mínimo para alerta (RN04). Se `quantity > 0`, registra automaticamente um movimento de entrada "Estoque inicial".',
  })
  @ApiResponse({ status: 201, description: 'Insumo criado' })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado ou inativo' })
  create(
    @Body() dto: CreateStockItemDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.estoqueService.createStockItem(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Atualizar insumo',
    description: 'Atualiza metadados do insumo (nome, unidade, mínimo, custo, fornecedor). Para alterar a quantidade use o endpoint de movimentações.',
  })
  @ApiParam({ name: 'id', description: 'UUID do insumo' })
  @ApiResponse({ status: 200, description: 'Insumo atualizado' })
  @ApiResponse({ status: 404, description: 'Insumo não encontrado' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockItemDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.estoqueService.updateStockItem(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Remover insumo',
    description: 'Remove o insumo. Bloqueado se houver movimentações registradas.',
  })
  @ApiParam({ name: 'id', description: 'UUID do insumo' })
  @ApiResponse({ status: 200, description: 'Insumo removido' })
  @ApiResponse({ status: 400, description: 'Insumo com movimentações não pode ser removido' })
  @ApiResponse({ status: 404, description: 'Insumo não encontrado' })
  remove(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.estoqueService.removeStockItem(pizzeriaId, id, user.sub);
  }

  // -------------------------------------------------------------------------
  // Movements
  // -------------------------------------------------------------------------

  @Post(':id/movements')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Registrar movimentação de estoque (RF75/RF77)',
    description: `Registra uma entrada ou saída de estoque e atualiza a quantidade do insumo atomicamente.

**Tipos:**
- \`entry\`: entrada (nota fiscal, reposição)
- \`withdrawal\`: retirada para uso na cozinha
- \`loss\`: perda (vencimento, quebra)
- \`adjustment\`: ajuste de inventário — informe a **quantidade absoluta** atual; o sistema calcula o delta automaticamente (pode aumentar ou reduzir o estoque)

Saídas (\`withdrawal\` e \`loss\`) são bloqueadas se a quantidade solicitada excede o estoque atual.`,
  })
  @ApiParam({ name: 'id', description: 'UUID do insumo' })
  @ApiResponse({ status: 201, description: 'Movimentação registrada e estoque atualizado' })
  @ApiResponse({ status: 400, description: 'Quantidade insuficiente para saída' })
  @ApiResponse({ status: 404, description: 'Insumo não encontrado' })
  createMovement(
    @Param('id') id: string,
    @Body() dto: CreateStockMovementDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.estoqueService.createMovement(pizzeriaId, id, dto, user.sub);
  }

  @Get(':id/movements')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente, PizzeriaUserRole.cozinha)
  @ApiOperation({
    summary: 'Histórico de movimentações (RF79)',
    description: 'Lista movimentações do insumo, da mais recente para a mais antiga. Filtrável por tipo.',
  })
  @ApiParam({ name: 'id', description: 'UUID do insumo' })
  @ApiQuery({ name: 'type', required: false, description: 'entry | withdrawal | loss | adjustment | auto_debit' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Padrão: 30, máx: 100' })
  @ApiResponse({ status: 200, description: 'Histórico paginado de movimentações' })
  @ApiResponse({ status: 404, description: 'Insumo não encontrado' })
  listMovements(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.estoqueService.listMovements(pizzeriaId, id, {
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
