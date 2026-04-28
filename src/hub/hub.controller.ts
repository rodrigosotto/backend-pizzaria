import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { HubService, type JwtPayload } from './hub.service';

@ApiTags('Hub')
@ApiBearerAuth('access-token')
@Controller('hub')
export class HubController {
  constructor(private readonly hubService: HubService) {}

  @Get('summary')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary: 'Resumo de todas as pizzarias do proprietário',
    description:
      'Retorna uma lista consolidada com todas as pizzarias ativas do owner autenticado. ' +
      'Para cada pizzaria são incluídos: contagem de pedidos em aberto, faturamento do dia (pedidos pagos), ' +
      'se o caixa está aberto e quantidade de itens de estoque abaixo do mínimo (alertas). ' +
      'Requer role `owner`.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Lista de pizzarias com seus respectivos resumos operacionais. ' +
      'Campos do `summary`: `open_orders` (pedidos com status fora de done/cancelled), ' +
      '`revenue_today` (soma do total dos pedidos com paymentStatus=paid no dia), ' +
      '`cash_open` (true se existe uma CashSession sem closedAt aberta hoje), ' +
      '`stock_alerts` (contagem de StockItems com quantity <= min_quantity).',
  })
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.hubService.getSummary(user);
  }

  @Get('pizzerias/:id/activate')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Ativar contexto de uma pizzaria',
    description:
      'Valida que o usuário autenticado possui um vínculo ativo (UserPizzeriaRole) na pizzaria ' +
      'informada e que ela não está com status inactive. ' +
      'Retorna o pizzeria_id, o nome da pizzaria e o role do usuário nela. ' +
      'O frontend deve armazenar esse contexto e incluir o pizzeria_id no header X-Pizzeria-Id ' +
      'em todas as requisições de operação subsequentes. ' +
      'Requer role `owner` ou `admin`.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Contexto confirmado. Retorna: `pizzeria_id` (UUID), `pizzeria_name` (nome fantasia) ' +
      'e `role` (PizzeriaUserRole do usuário nessa pizzaria).',
  })
  @ApiResponse({
    status: 403,
    description:
      'Acesso negado: vínculo inexistente ou inativo, ou pizzaria com status inactive.',
  })
  activate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.hubService.activate(id, user);
  }
}
