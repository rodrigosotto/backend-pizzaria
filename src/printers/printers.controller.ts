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
import { PrintersService } from './printers.service';
import { CreatePrinterDto } from './dto/create-printer.dto';
import { UpdatePrinterDto } from './dto/update-printer.dto';

@ApiTags('Printers')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@RequiresPizzeria()
@Roles(UserRole.owner, UserRole.admin)
@Controller('printers')
export class PrintersController {
  constructor(private readonly printersService: PrintersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar impressoras da pizzaria' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  list(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('active') active?: string,
  ) {
    const onlyActive = active === 'true' ? true : undefined;
    return this.printersService.list(pizzeriaId, onlyActive);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar impressora por ID' })
  findById(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
  ) {
    return this.printersService.findById(pizzeriaId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar impressora' })
  create(
    @CurrentPizzeria() pizzeriaId: string,
    @Body() dto: CreatePrinterDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.printersService.create(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar impressora' })
  update(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePrinterDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.printersService.update(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover impressora' })
  remove(
    @CurrentPizzeria() pizzeriaId: string,
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.printersService.remove(pizzeriaId, id, user.sub);
  }
}
