import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import type { JwtPayload } from './caixa.service';
import { CaixaService } from './caixa.service';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';

@ApiTags('Caixa')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão (RN03: apenas Admin/Caixa)' })
@Controller('cash')
@RequiresPizzeria()
export class CaixaController {
  constructor(private readonly caixaService: CaixaService) {}

  // =========================================================================
  // DASHBOARD
  // =========================================================================

  @Get('dashboard')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Dashboard financeiro do caixa',
    description: `Retorna visão consolidada financeira (RF64/RF65/RF70/RF71):

- **revenue**: total vendido hoje, nos últimos 15 e 30 dias (pedidos com \`paymentStatus=paid\`)
- **paymentBreakdown**: breakdown por forma de pagamento nos últimos 30 dias
- **serviceFeesToday**: soma das taxas de serviço do dia (RF71)
- **salesByHour**: distribuição de vendas por hora do dia nos últimos 30 dias (RF70 — identificar pico de demanda)
- **currentSession**: dados da sessão de caixa aberta, se houver`,
  })
  @ApiResponse({ status: 200, description: 'Dashboard financeiro' })
  getDashboard(@CurrentPizzeria() pizzeriaId: string) {
    return this.caixaService.getDashboard(pizzeriaId);
  }

  // =========================================================================
  // SESSÕES
  // =========================================================================

  @Post('sessions')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Abrir caixa (RF63)',
    description: `Registra uma nova sessão de caixa com fundo de troco inicial.

**RN03:** apenas roles \`admin\` e \`caixa\` (e \`owner\`) podem abrir o caixa.
Bloqueado se já houver uma sessão aberta para esta pizzaria.`,
  })
  @ApiResponse({ status: 201, description: 'Sessão de caixa aberta' })
  @ApiResponse({ status: 400, description: 'Já existe uma sessão aberta' })
  openSession(
    @Body() dto: OpenCashSessionDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.caixaService.openSession(pizzeriaId, dto, user.sub);
  }

  @Get('sessions/current')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa, UserRole.atendente)
  @ApiOperation({
    summary: 'Sessão de caixa ativa',
    description: 'Retorna a sessão de caixa aberta no momento, com suas sangrias. Retorna 404 se não houver sessão aberta.',
  })
  @ApiResponse({ status: 200, description: 'Sessão ativa com sangrias' })
  @ApiResponse({ status: 404, description: 'Nenhuma sessão aberta' })
  getCurrentSession(@CurrentPizzeria() pizzeriaId: string) {
    return this.caixaService.getCurrentSession(pizzeriaId);
  }

  @Get('sessions')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Histórico de sessões de caixa',
    description: 'Lista todas as sessões de caixa da pizzaria, da mais recente para a mais antiga.',
  })
  @ApiQuery({ name: 'onlyOpen', required: false, type: Boolean, description: 'Filtrar apenas sessões abertas' })
  @ApiQuery({ name: 'page', required: false, description: 'Padrão: 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Padrão: 20, máx: 100' })
  @ApiResponse({ status: 200, description: 'Lista paginada de sessões' })
  listSessions(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('onlyOpen') onlyOpen?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.caixaService.listSessions(pizzeriaId, {
      onlyOpen: onlyOpen === 'true',
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('sessions/:id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Detalhes de uma sessão de caixa',
    description: 'Retorna a sessão com quem abriu, quem fechou e todas as sangrias.',
  })
  @ApiParam({ name: 'id', description: 'UUID da sessão de caixa' })
  @ApiResponse({ status: 200, description: 'Detalhes da sessão' })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada' })
  getSession(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.caixaService.getSession(pizzeriaId, id);
  }

  @Post('sessions/:id/close')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Fechar caixa (RF67/RF69)',
    description: `Fecha a sessão de caixa com relatório consolidado e conciliação de valores (RN03).

**Relatório gerado no fechamento:**
- Totais por forma de pagamento: dinheiro, crédito, débito, PIX, voucher (RF65)
- Total de sangrias realizadas (RF66)
- **Saldo esperado** = fundo inicial + total dinheiro − sangrias
- **Saldo real** = valor físico informado pelo operador (\`actualBalance\`)
- **Diferença** = saldo real − saldo esperado (RF69)
- **Taxa de serviço total** incluída na resposta (RF71)

Bloqueado se a sessão já estiver fechada.`,
  })
  @ApiParam({ name: 'id', description: 'UUID da sessão de caixa' })
  @ApiResponse({ status: 200, description: 'Sessão fechada com relatório consolidado' })
  @ApiResponse({ status: 400, description: 'Sessão já fechada' })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada' })
  closeSession(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.caixaService.closeSession(pizzeriaId, id, dto, user.sub);
  }

  // =========================================================================
  // SANGRIAS — RF66
  // =========================================================================

  @Post('sessions/:id/withdrawals')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Registrar sangria (RF66)',
    description: `Registra uma retirada de dinheiro do caixa com motivo e responsável (RN03).

A \`totalWithdrawals\` da sessão é incrementada automaticamente.
Bloqueado se a sessão estiver fechada.`,
  })
  @ApiParam({ name: 'id', description: 'UUID da sessão de caixa' })
  @ApiResponse({ status: 201, description: 'Sangria registrada' })
  @ApiResponse({ status: 400, description: 'Sessão já fechada' })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada' })
  createWithdrawal(
    @Param('id') id: string,
    @Body() dto: CreateWithdrawalDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.caixaService.createWithdrawal(pizzeriaId, id, dto, user.sub);
  }

  @Get('sessions/:id/withdrawals')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Listar sangrias da sessão',
    description: 'Retorna todas as sangrias registradas na sessão de caixa, em ordem cronológica.',
  })
  @ApiParam({ name: 'id', description: 'UUID da sessão de caixa' })
  @ApiResponse({ status: 200, description: 'Lista de sangrias' })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada' })
  listWithdrawals(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.caixaService.listWithdrawals(pizzeriaId, id);
  }
}
