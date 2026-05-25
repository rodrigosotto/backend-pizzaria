/* This TypeScript class represents a controller for managing configuration
settings of a pizzeria in a NestJS application. */
import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { ConfigPizzeriaService } from './config-pizzeria.service';
import { UpdatePizzeriaConfigDto } from './dto/update-pizzeria-config.dto';

@ApiTags('Config')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Controller('config')
export class ConfigPizzeriaController {
  constructor(private readonly configService: ConfigPizzeriaService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar configurações da pizzaria' })
  getConfig(@CurrentPizzeria() pizzeriaId: string) {
    return this.configService.getConfig(pizzeriaId);
  }

  @Patch()
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({ summary: 'Atualizar configurações da pizzaria' })
  updateConfig(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: UpdatePizzeriaConfigDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.configService.updateConfig(pizzeriaId, dto, user.sub);
  }
}
