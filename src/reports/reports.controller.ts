import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StockCategory, UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { ReportFiltersDto, ReportFiltersWithLimitDto } from './dto/report-filters.dto';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';

@ApiTags('Relatórios')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão' })
@Controller('reports')
@RequiresPizzeria()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // =========================================================================
  // SALES
  // =========================================================================

  @Get('sales')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Relatório de vendas do período',
    description: `Visão consolidada de vendas (pedidos com \`paymentStatus=paid\`):

- **totals**: receita, subtotal, descontos, taxa de serviço, taxa de entrega, ticket médio, cancelamentos
- **byType**: breakdown por tipo de pedido (delivery / table / counter)
- **byPaymentMethod**: breakdown por forma de pagamento
- **byDay**: receita e contagem de pedidos por dia (ideal para gráficos de linha)

Padrão: período = mês atual. Use \`?dateFrom=\` e \`?dateTo=\` para personalizar.`,
  })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'ISO 8601, ex: 2026-04-01' })
  @ApiQuery({ name: 'dateTo',   required: false, description: 'ISO 8601, ex: 2026-04-30' })
  @ApiResponse({ status: 200, description: 'Relatório de vendas do período' })
  getSalesReport(
    @CurrentPizzeria() pizzeriaId: string,
    @Query() filters: ReportFiltersDto,
  ) {
    return this.reportsService.getSalesReport(pizzeriaId, filters);
  }

  @Get('sales/products')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Produtos mais vendidos',
    description: 'Top produtos por quantidade vendida no período, com receita gerada e número de pedidos. Padrão: top 20.',
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo',   required: false })
  @ApiQuery({ name: 'limit',    required: false, description: 'Máximo de produtos retornados. Padrão: 20, máx: 100.' })
  @ApiResponse({ status: 200, description: 'Ranking de produtos mais vendidos' })
  getTopProducts(
    @CurrentPizzeria() pizzeriaId: string,
    @Query() filters: ReportFiltersWithLimitDto,
  ) {
    return this.reportsService.getTopProducts(pizzeriaId, filters);
  }

  // =========================================================================
  // STOCK — RF80 / RF81
  // =========================================================================

  @Get('stock/consumption')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Consumo de estoque por período (RF80)',
    description: `Relatório de saídas de estoque no período por ingrediente (RF80).

Agrega movimentos do tipo \`withdrawal\`, \`loss\` e \`auto_debit\`:
- **totalWithdrawn**: retirado para uso na cozinha
- **totalLoss**: perdas (vencimento, quebra)
- **totalAutoDebit**: baixa automática por pedido
- **totalConsumed**: soma dos três tipos
- **estimatedCost**: custo estimado (\`totalConsumed × costPerUnit\`), se disponível

Filtro opcional por categoria de insumo (\`?category=\`).`,
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo',   required: false })
  @ApiQuery({ name: 'category', enum: StockCategory, required: false })
  @ApiResponse({ status: 200, description: 'Consumo de estoque por ingrediente' })
  getStockConsumption(
    @CurrentPizzeria() pizzeriaId: string,
    @Query() filters: ReportFiltersDto,
    @Query('category') category?: StockCategory,
  ) {
    return this.reportsService.getStockConsumption(pizzeriaId, { ...filters, category });
  }

  @Get('stock/consolidation')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Consolidação de insumos por pedidos (RF81)',
    description: `Relatório de consolidação de insumos necessários baseado nos pedidos do período (RF81).

Retorna dois lados independentes:
- **productsSold**: produtos vendidos com quantidade e receita (a partir de \`order_items\`)
- **stockConsumed**: insumos efetivamente consumidos no mesmo período (a partir de \`stock_movements\`)

> **Nota:** a correlação automática produto→insumo requer **ficha técnica** (\`product_recipes\`), não implementada nesta versão. A consolidação completa será possível após essa implementação.`,
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo',   required: false })
  @ApiResponse({ status: 200, description: 'Produtos vendidos e insumos consumidos no período' })
  getStockConsolidation(
    @CurrentPizzeria() pizzeriaId: string,
    @Query() filters: ReportFiltersDto,
  ) {
    return this.reportsService.getStockConsolidation(pizzeriaId, filters);
  }

  // =========================================================================
  // COUPONS — RF94
  // =========================================================================

  @Get('coupons')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Relatório de cupons utilizados (RF94)',
    description: `Impacto dos cupons no faturamento do período (RF94):

- **summary**: total de usos, desconto total concedido, receita gerada com e sem cupom
- **byCoupon**: ranking de cupons por quantidade de usos, com desconto total e receita gerada por cada um`,
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo',   required: false })
  @ApiResponse({ status: 200, description: 'Relatório de cupons com impacto no faturamento' })
  getCouponsReport(
    @CurrentPizzeria() pizzeriaId: string,
    @Query() filters: ReportFiltersDto,
  ) {
    return this.reportsService.getCouponsReport(pizzeriaId, filters);
  }

  // =========================================================================
  // CASH SESSIONS HISTORY
  // =========================================================================

  @Get('cash')
  @Roles(UserRole.owner, UserRole.admin, UserRole.caixa)
  @ApiOperation({
    summary: 'Histórico consolidado de sessões de caixa',
    description: `Lista todas as sessões de caixa do período com totais agregados:

- **sessions**: cada sessão com quem abriu/fechou, totais por método e diferença de conciliação
- **totals**: soma de todas as sessões fechadas (cash, credit, debit, pix, voucher, sangrias, diferença acumulada)
- **counts**: total de sessões, fechadas e abertas`,
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo',   required: false })
  @ApiResponse({ status: 200, description: 'Histórico de sessões com totais consolidados' })
  getCashReport(
    @CurrentPizzeria() pizzeriaId: string,
    @Query() filters: ReportFiltersDto,
  ) {
    return this.reportsService.getCashReport(pizzeriaId, filters);
  }
}
