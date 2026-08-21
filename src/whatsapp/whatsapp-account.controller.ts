import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { PizzeriaUserRole, WhatsAppAccountStatus } from '@prisma/client';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import type { JwtPayload } from '../modules/auth/auth.service';
import { UpsertWhatsAppAccountDto } from './dto/upsert-whatsapp-account.dto';
import { WhatsAppAccountService } from './whatsapp-account.service';

@ApiTags('WhatsApp — Conta por unidade')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@Controller('pizzerias/:pizzeriaId/whatsapp-account')
@RequiresPizzeria()
export class WhatsAppAccountController {
  constructor(private readonly accounts: WhatsAppAccountService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  get(@Param('pizzeriaId') pizzeriaId: string, @CurrentPizzeria() currentPizzeriaId: string) {
    this.assertSamePizzeria(pizzeriaId, currentPizzeriaId);
    return this.accounts.get(pizzeriaId);
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  upsert(
    @Param('pizzeriaId') pizzeriaId: string,
    @CurrentPizzeria() currentPizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertWhatsAppAccountDto,
  ) {
    this.assertSamePizzeria(pizzeriaId, currentPizzeriaId);
    return this.accounts.upsert(pizzeriaId, user.sub, dto);
  }

  @Patch('activate')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  activate(@Param('pizzeriaId') pizzeriaId: string, @CurrentPizzeria() currentPizzeriaId: string, @CurrentUser() user: JwtPayload) {
    this.assertSamePizzeria(pizzeriaId, currentPizzeriaId);
    return this.accounts.setStatus(pizzeriaId, user.sub, WhatsAppAccountStatus.active);
  }

  @Patch('deactivate')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  deactivate(@Param('pizzeriaId') pizzeriaId: string, @CurrentPizzeria() currentPizzeriaId: string, @CurrentUser() user: JwtPayload) {
    this.assertSamePizzeria(pizzeriaId, currentPizzeriaId);
    return this.accounts.setStatus(pizzeriaId, user.sub, WhatsAppAccountStatus.inactive);
  }

  private assertSamePizzeria(pathId: string, headerId: string): void {
    if (pathId !== headerId) throw new ForbiddenException('Pizzeria context mismatch');
  }
}
