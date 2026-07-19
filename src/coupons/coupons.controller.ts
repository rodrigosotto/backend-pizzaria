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
import { PizzeriaUserRole } from '@prisma/client';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({ summary: 'Listar cupons da pizzaria' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  list(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('active') active?: string,
  ) {
    const onlyActive = active === 'true' ? true : active === 'false' ? false : undefined;
    return this.couponsService.list(pizzeriaId, onlyActive);
  }

  @Get(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({ summary: 'Buscar cupom por ID' })
  findById(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
  ) {
    return this.couponsService.findById(pizzeriaId, id);
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({ summary: 'Criar cupom' })
  create(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: CreateCouponDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.couponsService.create(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({ summary: 'Atualizar cupom' })
  update(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.couponsService.update(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar cupom (soft delete)' })
  remove(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.couponsService.remove(pizzeriaId, id, user.sub);
  }

  @Post('validate')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente, PizzeriaUserRole.caixa)
  @ApiOperation({ summary: 'Validar e calcular desconto de um cupom' })
  validate(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: ValidateCouponDto,
  ) {
    return this.couponsService.validate(pizzeriaId, dto);
  }
}
