import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PizzeriaUserRole } from '@prisma/client';
import { ChatService } from './chat.service';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';

@ApiTags('Chat — WhatsApp Templates')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true })
@Controller('chat/whatsapp-templates')
@RequiresPizzeria()
export class WhatsAppTemplatesController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({ summary: 'Listar templates oficiais aprovados da Meta' })
  @ApiResponse({ status: 200, description: 'Templates oficiais autorizados para envio' })
  list(@CurrentPizzeria() pizzeriaId: string) {
    return this.chatService.listWhatsAppTemplates(pizzeriaId);
  }
}
