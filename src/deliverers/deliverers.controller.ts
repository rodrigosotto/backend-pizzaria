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
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { DeliverersService } from './deliverers.service';
import { CreateDelivererDto } from './dto/create-deliverer.dto';
import { UpdateDelivererDto } from './dto/update-deliverer.dto';

@ApiTags('Deliverers')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Roles(UserRole.owner, UserRole.admin)
@Controller('deliverers')
export class DeliverersController {
  constructor(private readonly deliverersService: DeliverersService) {}

  @Get()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({ summary: 'Listar entregadores da pizzaria' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  list(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('active') active?: string,
  ) {
    const onlyActive = active === 'true' ? true : undefined;
    return this.deliverersService.list(pizzeriaId, onlyActive);
  }

  @Get(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({ summary: 'Buscar entregador por ID' })
  findById(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
  ) {
    return this.deliverersService.findById(pizzeriaId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar entregador' })
  create(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: CreateDelivererDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.deliverersService.create(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar entregador' })
  update(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDelivererDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.deliverersService.update(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar entregador (soft delete)' })
  remove(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.deliverersService.remove(pizzeriaId, id, user.sub);
  }
}
