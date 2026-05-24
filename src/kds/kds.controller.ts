import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { KdsService } from './kds.service';
import { UpdateKdsStatusDto } from './dto/update-kds-status.dto';

@ApiTags('KDS')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Controller('kds')
export class KdsController {
  constructor(private readonly kdsService: KdsService) {}

  @Get('queue')
  @Roles(UserRole.owner, UserRole.admin, UserRole.cozinha, UserRole.atendente)
  @ApiOperation({
    summary: 'Fila da cozinha',
    description: 'Retorna itens pending e preparing ordenados por tempo de criação.',
  })
  @ApiResponse({ status: 200, description: 'Fila retornada' })
  getQueue(@CurrentPizzeria() pizzeriaId: string) {
    return this.kdsService.getQueue(pizzeriaId);
  }

  @Patch('items/:id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner, UserRole.admin, UserRole.cozinha)
  @ApiOperation({
    summary: 'Avançar status do item',
    description: 'Transições válidas: pending → preparing → done. Cada step define startedAt/completedAt.',
  })
  @ApiParam({ name: 'id', description: 'UUID do KdsItem' })
  @ApiResponse({ status: 200, description: 'Status atualizado' })
  @ApiResponse({ status: 400, description: 'Transição inválida' })
  @ApiResponse({ status: 404, description: 'Item não encontrado' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateKdsStatusDto,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.kdsService.updateStatus(pizzeriaId, id, dto.status);
  }

  @Delete('queue')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.owner, UserRole.admin, UserRole.cozinha)
  @ApiOperation({
    summary: 'Limpar itens concluídos',
    description: 'Remove todos os itens com status done e emite kds:queue:cleared via WebSocket.',
  })
  @ApiResponse({ status: 200, description: 'Fila limpa' })
  clearQueue(@CurrentPizzeria() pizzeriaId: string) {
    return this.kdsService.clearDoneItems(pizzeriaId);
  }
}
