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
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { CardapioService } from './cardapio.service';
import type { JwtPayload } from './cardapio.service';
import { CreateComboDto, ComboItemDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';

@ApiTags('Cardápio — Combos')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'ID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão (role insuficiente ou sem vínculo com a pizzaria)' })
@Controller('menu/combos')
@RequiresPizzeria()
export class CombosController {
  constructor(private readonly cardapioService: CardapioService) {}

  @Get()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Listar combos e promoções',
    description: 'Retorna todos os combos da pizzaria com seus itens, produtos e tamanhos vinculados. Inclui combos ativos e inativos.',
  })
  @ApiResponse({ status: 200, description: 'Lista de combos com itens e produtos' })
  listCombos(@CurrentPizzeria() pizzeriaId: string) {
    return this.cardapioService.listCombos(pizzeriaId);
  }

  @Get(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Buscar combo por ID',
    description: 'Retorna o combo completo com todos os itens, produtos e tamanhos vinculados.',
  })
  @ApiParam({ name: 'id', description: 'UUID do combo' })
  @ApiResponse({ status: 200, description: 'Combo com itens detalhados' })
  @ApiResponse({ status: 404, description: 'Combo não encontrado nesta pizzaria' })
  getCombo(@Param('id') id: string, @CurrentPizzeria() pizzeriaId: string) {
    return this.cardapioService.getCombo(pizzeriaId, id);
  }

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Criar combo',
    description: 'Cria um combo com preço especial. A criação é atômica — o combo e todos os itens são gravados em uma única transação. Mínimo de 2 itens obrigatório. Todos os produtos informados devem pertencer à pizzaria. Os campos `validFrom` e `validTo` definem a vigência — fora do intervalo o combo não aparece no cardápio público.',
  })
  @ApiResponse({ status: 201, description: 'Combo criado com seus itens' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (menos de 2 itens, campos obrigatórios ausentes)' })
  @ApiResponse({ status: 404, description: 'Um ou mais produtos não encontrados nesta pizzaria' })
  createCombo(
    @Body() dto: CreateComboDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.createCombo(pizzeriaId, dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Atualizar dados do combo',
    description: 'Atualiza nome, descrição, preço, vigência ou status do combo. Para alterar os itens use os endpoints `/items`.',
  })
  @ApiParam({ name: 'id', description: 'UUID do combo' })
  @ApiResponse({ status: 200, description: 'Combo atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Combo não encontrado nesta pizzaria' })
  updateCombo(
    @Param('id') id: string,
    @Body() dto: UpdateComboDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.updateCombo(pizzeriaId, id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover combo',
    description: 'Remove o combo e todos os seus itens permanentemente (cascade delete).',
  })
  @ApiParam({ name: 'id', description: 'UUID do combo' })
  @ApiResponse({ status: 200, description: 'Combo removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Combo não encontrado nesta pizzaria' })
  removeCombo(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.removeCombo(pizzeriaId, id, user);
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  @Post(':id/items')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Adicionar item ao combo',
    description: 'Adiciona um produto ao combo existente. O `productSizeId` é opcional — quando omitido, qualquer tamanho do produto serve para compor o combo.',
  })
  @ApiParam({ name: 'id', description: 'UUID do combo' })
  @ApiResponse({ status: 201, description: 'Item adicionado ao combo com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Combo ou produto não encontrado nesta pizzaria' })
  addItem(
    @Param('id') id: string,
    @Body() dto: ComboItemDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.addComboItem(pizzeriaId, id, dto, user);
  }

  @Delete(':id/items/:itemId')
  @Roles(UserRole.owner, UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover item do combo',
    description: 'Remove um item específico do combo.',
  })
  @ApiParam({ name: 'id', description: 'UUID do combo' })
  @ApiParam({ name: 'itemId', description: 'UUID do item do combo' })
  @ApiResponse({ status: 200, description: 'Item removido do combo com sucesso' })
  @ApiResponse({ status: 404, description: 'Combo ou item não encontrado' })
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.removeComboItem(pizzeriaId, id, itemId, user);
  }
}
