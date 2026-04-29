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
import { UserRole } from '@prisma/client';
import type { JwtPayload } from './estoque.service';
import { EstoqueService } from './estoque.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';

@ApiTags('Estoque — Fornecedores')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão' })
@Controller('suppliers')
@RequiresPizzeria()
export class SuppliersController {
  constructor(private readonly estoqueService: EstoqueService) {}

  @Get()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Listar fornecedores',
    description: 'Retorna todos os fornecedores da pizzaria. Filtro opcional por status ativo.',
  })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'Filtrar por isActive (true/false)' })
  @ApiResponse({ status: 200, description: 'Lista de fornecedores com contagem de insumos vinculados' })
  findAll(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('active') active?: string,
  ) {
    const activeFilter = active === undefined ? undefined : active === 'true';
    return this.estoqueService.listSuppliers(pizzeriaId, activeFilter);
  }

  @Get(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Buscar fornecedor por ID',
    description: 'Retorna o fornecedor com a lista de insumos vinculados a ele.',
  })
  @ApiParam({ name: 'id', description: 'UUID do fornecedor' })
  @ApiResponse({ status: 200, description: 'Fornecedor com insumos' })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
  findOne(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.estoqueService.getSupplier(pizzeriaId, id);
  }

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Cadastrar fornecedor (RF82)',
    description: 'Cadastro completo: razão social, CNPJ, representante, telefone, e-mail e categorias de insumos fornecidos.',
  })
  @ApiResponse({ status: 201, description: 'Fornecedor criado' })
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.estoqueService.createSupplier(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Atualizar fornecedor',
    description: 'Atualiza dados do fornecedor. Use `isActive: false` para desativar.',
  })
  @ApiParam({ name: 'id', description: 'UUID do fornecedor' })
  @ApiResponse({ status: 200, description: 'Fornecedor atualizado' })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.estoqueService.updateSupplier(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Remover fornecedor',
    description: 'Remove o fornecedor. Bloqueado se houver insumos vinculados — desvincule-os antes ou use `isActive: false`.',
  })
  @ApiParam({ name: 'id', description: 'UUID do fornecedor' })
  @ApiResponse({ status: 200, description: 'Fornecedor removido' })
  @ApiResponse({ status: 400, description: 'Fornecedor possui insumos vinculados' })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
  remove(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.estoqueService.removeSupplier(pizzeriaId, id, user.sub);
  }

  @Get(':id/purchases')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Histórico de compras do fornecedor (RF84)',
    description: 'Lista todos os movimentos de entrada (`entry`) dos insumos vinculados a este fornecedor, em ordem cronológica decrescente. Representa o histórico de compras realizadas com ele.',
  })
  @ApiParam({ name: 'id', description: 'UUID do fornecedor' })
  @ApiQuery({ name: 'page', required: false, description: 'Padrão: 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Padrão: 30, máx: 100' })
  @ApiResponse({ status: 200, description: 'Histórico paginado de entradas de estoque com dados do insumo' })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
  getPurchases(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.estoqueService.getSupplierPurchases(pizzeriaId, id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
