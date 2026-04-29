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
import { UpdateOrderItemsDto } from './dto/update-order-items.dto';
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

  @Post()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Criar novo pedido',
    description: `Registra um novo pedido (RF03/RF04). Tipos: delivery, table, counter.

**Validações na criação:**
- \`delivery\`: exige \`deliveryAddressId\` + respeita horário de funcionamento (RN02) + pedido mínimo (RN07)
- \`table\`: exige \`tableId\`
- Cliente na blacklist é bloqueado

**Cálculo de preço:**
- Itens simples: \`ProductSize.price\`
- Pizzas fracionadas: aplica \`flavorPriceRule\` do produto (RN01)
- Borda recheada: adiciona \`extraPrice\` baseado no rótulo do tamanho
- Taxa de serviço: calculada de \`PizzeriaConfig.serviceFeePct\` (RN10)

**Cupom (RN06):** validado no servidor — vigência, valor mínimo, limite total e por CPF.`,
  })
  @ApiResponse({ status: 201, description: 'Pedido criado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos, pizzaria fechada, pedido mínimo não atingido ou cupom inválido' })
  @ApiResponse({ status: 404, description: 'Produto, tamanho, borda ou cliente não encontrado' })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.create(pizzeriaId, dto, user.sub);
  }

  @Get()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha, UserRole.caixa)
  @ApiOperation({
    summary: 'Listar pedidos da pizzaria',
    description: 'Retorna pedidos paginados com filtros opcionais por status, tipo e data.',
  })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  @ApiQuery({ name: 'type', enum: OrderType, required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'ISO 8601, ex: 2025-01-01' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'ISO 8601, ex: 2025-12-31' })
  @ApiQuery({ name: 'page', required: false, description: 'Padrão: 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Padrão: 20, máx: 100' })
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

  @Get('number/:orderNumber')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha, UserRole.caixa)
  @ApiOperation({
    summary: 'Buscar pedido pelo número',
    description: 'Busca rápida por número sequencial do pedido (RF05). Útil em cozinha/balcão.',
  })
  @ApiParam({ name: 'orderNumber', type: Number })
  @ApiResponse({ status: 200, description: 'Pedido encontrado' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  findByNumber(
    @Param('orderNumber', ParseIntPipe) orderNumber: number,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.ordersService.findByNumber(pizzeriaId, orderNumber);
  }

  @Get(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha, UserRole.caixa)
  @ApiOperation({
    summary: 'Obter detalhes do pedido',
    description: 'Retorna pedido completo com itens, sabores, cliente, entregador e cupom.',
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

  @Patch(':id/items')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Editar itens do pedido (RF09)',
    description: `Substitui todos os itens do pedido por uma nova lista. Só é permitido quando o status é \`accepted\` (antes de ir para preparo).

Os totais são recalculados automaticamente: subtotal, desconto do cupom original, taxa de serviço e total final.`,
  })
  @ApiParam({ name: 'id', description: 'UUID do pedido' })
  @ApiResponse({ status: 200, description: 'Itens atualizados e totais recalculados' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  @ApiResponse({ status: 422, description: 'Pedido não está no status "accepted"' })
  updateItems(
    @Param('id') id: string,
    @Body() dto: UpdateOrderItemsDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.updateItems(pizzeriaId, id, dto, user.sub);
  }

  @Patch(':id/status')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.cozinha)
  @ApiOperation({
    summary: 'Atualizar status do pedido',
    description: `Avança o status (RF06/RF07). Transições válidas:
- \`new\` → accepted | cancelled
- \`accepted\` → preparing | cancelled
- \`preparing\` → ready | cancelled
- \`ready\` → delivering (só delivery) | done | cancelled
- \`delivering\` → done | cancelled

\`delivering\` exige entregador atribuído (RN08). Status \`done\` incrementa \`loyaltyStamps\` do cliente (RF52).`,
  })
  @ApiParam({ name: 'id', description: 'UUID do pedido' })
  @ApiResponse({ status: 200, description: 'Status atualizado' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  @ApiResponse({ status: 422, description: 'Transição inválida' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.updateStatus(pizzeriaId, id, dto, user.sub);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Cancelar pedido (RF08)',
    description: `Cancela o pedido com motivo obrigatório. Registrado em auditoria.

**RN05:** cancelamento de pedido já pago (\`paymentStatus = paid\`) é restrito a Admin/Owner.`,
  })
  @ApiParam({ name: 'id', description: 'UUID do pedido' })
  @ApiResponse({ status: 200, description: 'Pedido cancelado' })
  @ApiResponse({ status: 403, description: 'Pagamento já registrado — requer Admin/Owner (RN05)' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  @ApiResponse({ status: 422, description: 'Status terminal — não pode ser cancelado' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.cancel(pizzeriaId, id, dto, user.sub, user.role as UserRole);
  }

  @Patch(':id/payment')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.caixa)
  @ApiOperation({
    summary: 'Registrar pagamento',
    description: 'Registra forma de pagamento e marca como pago. Para `cash`, informe `amountPaid` para validar que cobre o total.',
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
