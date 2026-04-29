import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { OrderStatus, OrderType, UserRole } from '@prisma/client';
import type { JwtPayload } from './orders.service';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';

@ApiTags('Pedidos')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão (role insuficiente ou pizzaria não autorizada)' })
@Controller('orders')
@RequiresPizzeria()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ---------------------------------------------------------------------------
  // POST /orders — RF03: Criar pedido
  // ---------------------------------------------------------------------------

  @Post()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Criar novo pedido',
    description: `Registra um novo pedido (RF03). Tipos suportados: delivery, table, counter.

**Cálculo de preço:**
- Itens simples: \`ProductSize.price\`
- Pizzas fracionadas: aplica \`flavorPriceRule\` do produto (RN01)
  - \`highest\`: cobra o sabor mais caro
  - \`average\`: cobra a média dos sabores
  - \`fixed\`: cobra o preço fixo do tamanho
- Borda recheada: adiciona \`extraPrice\` baseado no tamanho

**Cupom (RN06):** validado no servidor — vigência, valor mínimo, limite total e limite por CPF.`,
  })
  @ApiResponse({ status: 201, description: 'Pedido criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos, cliente na lista negra ou cupom inválido' })
  @ApiResponse({ status: 404, description: 'Produto, tamanho, borda ou cliente não encontrado' })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.create(pizzeriaId, dto, user.sub);
  }

  // ---------------------------------------------------------------------------
  // GET /orders — Listar pedidos com filtros
  // ---------------------------------------------------------------------------

  @Get()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha, UserRole.caixa)
  @ApiOperation({
    summary: 'Listar pedidos da pizzaria',
    description: 'Retorna pedidos paginados com filtros opcionais por status, tipo e data.',
  })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false, description: 'Filtrar por status' })
  @ApiQuery({ name: 'type', enum: OrderType, required: false, description: 'Filtrar por tipo' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filtrar por cliente (UUID)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Data inicial (ISO 8601, ex: 2025-01-01)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Data final (ISO 8601, ex: 2025-12-31)' })
  @ApiQuery({ name: 'page', required: false, description: 'Página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Itens por página (padrão: 20, máx: 100)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de pedidos' })
  findAll(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('status') status?: OrderStatus,
    @Query('type') type?: OrderType,
    @Query('customerId') customerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findAll(pizzeriaId, {
      status,
      type,
      customerId,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // GET /orders/number/:orderNumber — RF05: busca por número do pedido
  // ---------------------------------------------------------------------------

  @Get('number/:orderNumber')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha, UserRole.caixa)
  @ApiOperation({
    summary: 'Buscar pedido pelo número',
    description: 'Busca rápida por número sequencial do pedido (RF05). Útil para lookup em cozinha/balcão.',
  })
  @ApiParam({ name: 'orderNumber', type: Number, description: 'Número sequencial do pedido (por pizzaria)' })
  @ApiResponse({ status: 200, description: 'Pedido encontrado' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  findByNumber(
    @Param('orderNumber', ParseIntPipe) orderNumber: number,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.ordersService.findByNumber(pizzeriaId, orderNumber);
  }

  // ---------------------------------------------------------------------------
  // GET /orders/:id — Detalhes do pedido
  // ---------------------------------------------------------------------------

  @Get(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha, UserRole.caixa)
  @ApiOperation({
    summary: 'Obter detalhes do pedido',
    description: 'Retorna pedido completo com itens, sabores, cliente, entregador e cupom aplicado.',
  })
  @ApiParam({ name: 'id', description: 'UUID do pedido' })
  @ApiResponse({ status: 200, description: 'Detalhes do pedido' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  findOne(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.ordersService.findOne(pizzeriaId, id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /orders/:id/status — RF06, RF07: Avançar status do pedido
  // ---------------------------------------------------------------------------

  @Patch(':id/status')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha)
  @ApiOperation({
    summary: 'Atualizar status do pedido',
    description: `Avança o status do pedido (RF06/RF07). Transições válidas:
- \`new\` → accepted | cancelled
- \`accepted\` → preparing | cancelled
- \`preparing\` → ready | cancelled
- \`ready\` → delivering (só delivery) | done | cancelled
- \`delivering\` → done | cancelled

Ao marcar como \`done\`, o sistema incrementa automaticamente \`loyaltyStamps\` do cliente (RF52).`,
  })
  @ApiParam({ name: 'id', description: 'UUID do pedido' })
  @ApiResponse({ status: 200, description: 'Status atualizado' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  @ApiResponse({ status: 422, description: 'Transição de status inválida' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.updateStatus(pizzeriaId, id, dto, user.sub);
  }

  // ---------------------------------------------------------------------------
  // PATCH /orders/:id/cancel — RF08: Cancelar pedido
  // ---------------------------------------------------------------------------

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Cancelar pedido',
    description: 'Cancela o pedido com motivo obrigatório (RF08). Não é possível cancelar pedidos em status terminal (done). Motivo registrado em auditoria.',
  })
  @ApiParam({ name: 'id', description: 'UUID do pedido' })
  @ApiResponse({ status: 200, description: 'Pedido cancelado' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  @ApiResponse({ status: 422, description: 'Pedido não pode mais ser cancelado (status terminal)' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.cancel(pizzeriaId, id, dto, user.sub);
  }

  // ---------------------------------------------------------------------------
  // PATCH /orders/:id/payment — Registrar pagamento
  // ---------------------------------------------------------------------------

  @Patch(':id/payment')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.caixa)
  @ApiOperation({
    summary: 'Registrar pagamento do pedido',
    description: `Registra a forma de pagamento e marca o pedido como pago. Para pagamento em dinheiro (cash), informe \`amountPaid\` para validar que o valor cobre o total.`,
  })
  @ApiParam({ name: 'id', description: 'UUID do pedido' })
  @ApiResponse({ status: 200, description: 'Pagamento registrado' })
  @ApiResponse({ status: 400, description: 'Pedido já pago ou valor insuficiente' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  registerPayment(
    @Param('id') id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.registerPayment(pizzeriaId, id, dto, user.sub);
  }
}
