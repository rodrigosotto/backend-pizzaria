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
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { LoyaltyService } from './loyalty.service';
import { CreateLoyaltyDto } from './dto/create-loyalty.dto';
import { UpdateLoyaltyDto } from './dto/update-loyalty.dto';

@ApiTags('Loyalty')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Roles(UserRole.owner, UserRole.admin)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get()
  @ApiOperation({ summary: 'Listar programas de fidelidade da pizzaria' })
  list(@CurrentPizzeria() pizzeriaId: string) {
    return this.loyaltyService.list(pizzeriaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar programa de fidelidade por ID' })
  findById(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
  ) {
    return this.loyaltyService.findById(pizzeriaId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar programa de fidelidade' })
  create(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: CreateLoyaltyDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.loyaltyService.create(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar programa de fidelidade' })
  update(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.loyaltyService.update(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover programa de fidelidade' })
  remove(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.loyaltyService.remove(pizzeriaId, id, user.sub);
  }
}
