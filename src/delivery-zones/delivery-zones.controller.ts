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
import { DeliveryZonesService } from './delivery-zones.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

@ApiTags('Delivery Zones')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Roles(UserRole.owner, UserRole.admin)
@Controller('delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar zonas de entrega da pizzaria' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  list(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('active') active?: string,
  ) {
    const onlyActive = active === 'true' ? true : undefined;
    return this.deliveryZonesService.list(pizzeriaId, onlyActive);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar zona de entrega por ID' })
  findById(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
  ) {
    return this.deliveryZonesService.findById(pizzeriaId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar zona de entrega' })
  create(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: CreateDeliveryZoneDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.deliveryZonesService.create(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar zona de entrega' })
  update(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryZoneDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.deliveryZonesService.update(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover zona de entrega' })
  remove(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.deliveryZonesService.remove(pizzeriaId, id, user.sub);
  }
}
