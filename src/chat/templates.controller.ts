import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PizzeriaUserRole } from '@prisma/client';
import type { JwtPayload } from './chat.service';
import { ChatService } from './chat.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';

@ApiTags('Chat — Templates')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão' })
@Controller('chat/templates')
@RequiresPizzeria()
export class TemplatesController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Listar templates de mensagem (RF62)',
    description: `Lista templates de resposta rápida da pizzaria (RF62).

Templates são mensagens pré-configuradas que o atendente envia com um clique — ex: confirmação de pedido, cardápio digital, tempo estimado.

Use \`?activeOnly=false\` para incluir templates desativados (gestão pelo admin).`,
  })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean, description: 'Padrão: true — apenas templates ativos' })
  @ApiResponse({ status: 200, description: 'Lista de templates' })
  listTemplates(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const active = activeOnly === 'false' ? false : true;
    return this.chatService.listTemplates(pizzeriaId, active);
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Criar template (RF62/RF57)',
    description: `Cria um template de mensagem rápida.

O campo \`content\` suporta variáveis entre \`{{ }}\` para substituição manual pelo atendente antes de enviar.

**Exemplos de templates úteis (RF57):**
- *Pedido confirmado*: "Olá {{nome}}! Seu pedido foi confirmado. Tempo estimado: {{tempo}} min 🍕"
- *Saiu para entrega*: "Seu pedido saiu para entrega! Em breve chegará. 🛵"
- *Pedido entregue*: "Pedido entregue! Obrigado pela preferência. Deixe sua avaliação 🌟"
- *Cardápio*: "Veja nosso cardápio completo: {{link}} 📲"`,
  })
  @ApiResponse({ status: 201, description: 'Template criado' })
  createTemplate(
    @Body() dto: CreateTemplateDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.createTemplate(pizzeriaId, dto, user.sub);
  }

  @Patch(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Atualizar template',
    description: 'Atualiza conteúdo, título ou status do template. Use `isActive: false` para desativar sem apagar.',
  })
  @ApiParam({ name: 'id', description: 'UUID do template' })
  @ApiResponse({ status: 200, description: 'Template atualizado' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.updateTemplate(pizzeriaId, id, dto, user.sub);
  }

  @Delete(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({
    summary: 'Remover template',
    description: 'Remove permanentemente o template. Prefira `isActive: false` para preservar histórico.',
  })
  @ApiParam({ name: 'id', description: 'UUID do template' })
  @ApiResponse({ status: 200, description: 'Template removido' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  removeTemplate(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.removeTemplate(pizzeriaId, id, user.sub);
  }
}
