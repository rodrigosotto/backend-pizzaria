import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { KdsItemStatus, PizzeriaUserRole } from '@prisma/client';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';
import type { JwtPayload } from './kds.service';
import { KdsService } from './kds.service';
import { UpdateKdsItemStatusDto } from './dto/kds.dto';

@ApiTags('KDS — Kitchen Display System')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão' })
@Controller('kds')
@RequiresPizzeria()
export class KdsController {
  constructor(private readonly kdsService: KdsService) {}

  // ── GET /kds/queue ──────────────────────────────────────────────────────────

  @Get('queue')
  @PizzeriaRoles(PizzeriaUserRole.cozinha, PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Fila da cozinha (RF21)',
    description:
      'Lista todos os itens na fila do KDS, ordenados por `createdAt ASC` (mais antigo primeiro). ' +
      'Filtrável por status para exibir apenas a visão desejada no display da cozinha.',
  })
  @ApiQuery({
    name: 'status',
    enum: KdsItemStatus,
    required: false,
    description: 'Filtrar por status: pending | preparing | done',
  })
  @ApiResponse({ status: 200, description: 'Fila da cozinha' })
  getQueue(
    @CurrentPizzeria() pizzariaId: string,
    @Query('status') status?: KdsItemStatus,
  ) {
    return this.kdsService.getQueue(pizzariaId, status);
  }

  // ── PATCH /kds/items/:itemId/status ─────────────────────────────────────────

  @Patch('items/:itemId/status')
  @PizzeriaRoles(PizzeriaUserRole.cozinha)
  @ApiOperation({
    summary: 'Atualizar status de item KDS (RF22/RF23)',
    description:
      'Avança o status de um item na fila: `pending → preparing → done`. ' +
      'Ao mover para `preparing`, registra `startedAt`. Ao mover para `done`, registra `completedAt`. ' +
      'Transições são validadas — não é possível voltar atrás ou pular etapas.',
  })
  @ApiParam({ name: 'itemId', description: 'UUID do item KDS' })
  @ApiResponse({ status: 200, description: 'Status atualizado' })
  @ApiResponse({ status: 400, description: 'Transição de status inválida' })
  @ApiResponse({ status: 404, description: 'Item não encontrado' })
  updateItemStatus(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateKdsItemStatusDto,
    @CurrentPizzeria() pizzariaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.kdsService.updateItemStatus(pizzariaId, itemId, dto.status, user.sub);
  }

  // ── GET /kds/metrics ────────────────────────────────────────────────────────

  @Get('metrics')
  @PizzeriaRoles(PizzeriaUserRole.cozinha, PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Métricas do turno atual (RF25)',
    description:
      'Retorna estatísticas em tempo real da cozinha:\n' +
      '- `avgPrepTime`: tempo médio de preparo em minutos (startedAt → completedAt)\n' +
      '- `pendingCount`, `preparingCount`, `doneCount`: contagem por status\n' +
      '- `lateItems`: itens PENDING há mais de 15 minutos — indicam sobrecarga ou esquecimento',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas da cozinha',
    schema: {
      example: {
        avgPrepTime: 8.5,
        pendingCount: 3,
        preparingCount: 2,
        doneCount: 12,
        lateItems: [
          { id: 'uuid', productName: 'Pizza Margherita', orderNumber: 42, waitingMinutes: 18 },
        ],
      },
    },
  })
  getMetrics(@CurrentPizzeria() pizzariaId: string) {
    return this.kdsService.getMetrics(pizzariaId);
  }

  // ── DELETE /kds/queue/done ──────────────────────────────────────────────────

  @Delete('queue/done')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Limpar fila de itens concluídos (RF26)',
    description:
      'Remove da fila todos os itens com status `done` cujo `completedAt` é anterior a 2 horas atrás. ' +
      'Emite evento `kds:queue:cleared` via WebSocket para atualizar todos os displays conectados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Fila limpa',
    schema: { example: { cleared: true, removed: 5 } },
  })
  clearDone(
    @CurrentPizzeria() pizzariaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.kdsService.clearDoneItems(pizzariaId, user.sub);
  }
}
