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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TableStatus, UserRole } from '@prisma/client';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { OpenSessionDto } from './dto/open-session.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';

@ApiTags('Tables')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  // =========================================================================
  // TABLES
  // =========================================================================

  @Get()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.caixa, UserRole.cozinha)
  @ApiOperation({ summary: 'Listar mesas da pizzaria' })
  @ApiQuery({ name: 'status', required: false, enum: TableStatus })
  listTables(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('status') status?: TableStatus,
  ) {
    return this.tablesService.listTables(pizzeriaId, status);
  }

  @Get('reservations')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({ summary: 'Listar reservas de mesa' })
  @ApiQuery({ name: 'tableId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'ISO 8601' })
  listReservations(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('tableId') tableId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.tablesService.listReservations(pizzeriaId, tableId, dateFrom, dateTo);
  }

  @Get(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.caixa, UserRole.cozinha)
  @ApiOperation({ summary: 'Buscar mesa por ID (inclui sessão ativa)' })
  findTableById(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
  ) {
    return this.tablesService.findTableById(pizzeriaId, id);
  }

  @Post()
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Criar mesa' })
  createTable(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: CreateTableDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.tablesService.createTable(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Atualizar mesa' })
  updateTable(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.tablesService.updateTable(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover mesa (somente se livre e sem sessão ativa)' })
  removeTable(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.tablesService.removeTable(pizzeriaId, id, user.sub);
  }

  // =========================================================================
  // TABLE SESSIONS
  // =========================================================================

  @Post(':tableId/sessions')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({ summary: 'Abrir sessão de atendimento na mesa' })
  @ApiParam({ name: 'tableId', description: 'ID da mesa' })
  openSession(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('tableId') tableId: string,
    @Body() dto: OpenSessionDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.tablesService.openSession(pizzeriaId, tableId, dto, user.sub);
  }

  @Get(':tableId/sessions/current')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.caixa, UserRole.cozinha)
  @ApiOperation({ summary: 'Obter sessão ativa da mesa (com pedidos)' })
  @ApiParam({ name: 'tableId', description: 'ID da mesa' })
  getCurrentSession(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('tableId') tableId: string,
  ) {
    return this.tablesService.getCurrentSession(pizzeriaId, tableId);
  }

  @Patch(':tableId/sessions/:sessionId/close')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente, UserRole.caixa)
  @ApiOperation({ summary: 'Fechar sessão de atendimento (libera a mesa)' })
  @ApiParam({ name: 'tableId', description: 'ID da mesa' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão' })
  closeSession(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('tableId') tableId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.tablesService.closeSession(pizzeriaId, tableId, sessionId, user.sub);
  }

  // =========================================================================
  // TABLE RESERVATIONS
  // =========================================================================

  @Post('reservations')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({ summary: 'Criar reserva de mesa' })
  createReservation(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.tablesService.createReservation(pizzeriaId, dto, user.sub);
  }

  @Delete('reservations/:id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancelar reserva de mesa' })
  cancelReservation(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.tablesService.cancelReservation(pizzeriaId, id, user.sub);
  }
}
