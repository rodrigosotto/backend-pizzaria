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
import { CreateCrustDto } from './dto/create-crust.dto';
import { UpdateCrustDto } from './dto/update-crust.dto';

@ApiTags('Cardápio — Bordas')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'ID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão (role insuficiente ou sem vínculo com a pizzaria)' })
@Controller('menu/crusts')
@RequiresPizzeria()
export class CrustsController {
  constructor(private readonly cardapioService: CardapioService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Listar bordas disponíveis',
    description: 'Retorna todas as bordas da pizzaria (ativas e inativas) com os preços extras por tamanho (P/M/G/GG).',
  })
  @ApiResponse({ status: 200, description: 'Lista de bordas com preços extras por tamanho' })
  listCrusts(@CurrentPizzeria() pizzeriaId: string) {
    return this.cardapioService.listCrusts(pizzeriaId);
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Criar borda recheada',
    description: 'Cadastra uma nova borda recheada. Os campos `extraPriceS/M/L/Xl` definem o acréscimo no preço final para cada tamanho de pizza. Use `0` para tamanhos sem acréscimo.',
  })
  @ApiResponse({ status: 201, description: 'Borda criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (preço negativo, nome muito longo, etc.)' })
  createCrust(
    @Body() dto: CreateCrustDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.createCrust(pizzeriaId, dto, user);
  }

  @Patch(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Atualizar borda',
    description: 'Atualiza parcialmente os dados da borda. Útil para reajuste de preços ou para ativar/desativar.',
  })
  @ApiParam({ name: 'id', description: 'UUID da borda' })
  @ApiResponse({ status: 200, description: 'Borda atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Borda não encontrada nesta pizzaria' })
  updateCrust(
    @Param('id') id: string,
    @Body() dto: UpdateCrustDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.updateCrust(pizzeriaId, id, dto, user);
  }

  @Delete(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover borda',
    description: 'Remove a borda permanentemente. Prefira desativar (`isActive: false`) para preservar histórico de pedidos que já usaram esta borda.',
  })
  @ApiParam({ name: 'id', description: 'UUID da borda' })
  @ApiResponse({ status: 200, description: 'Borda removida com sucesso' })
  @ApiResponse({ status: 404, description: 'Borda não encontrada nesta pizzaria' })
  removeCrust(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cardapioService.removeCrust(pizzeriaId, id, user);
  }
}
