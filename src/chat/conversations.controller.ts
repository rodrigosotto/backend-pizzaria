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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PizzeriaUserRole } from '@prisma/client';
import type { JwtPayload } from './chat.service';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { SendWhatsAppTemplateMessageDto } from './dto/send-whatsapp-template-message.dto';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { CurrentPizzeriaRole } from '../modules/auth/decorators/current-pizzeria-role.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { PizzeriaRoles } from '../modules/auth/decorators/pizzeria-roles.decorator';

@ApiTags('Chat — Conversas')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'UUID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token JWT não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão' })
@Controller('chat/conversations')
@RequiresPizzeria()
export class ConversationsController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Listar conversas (RF56)',
    description: `Lista de conversas estilo WhatsApp — ordenadas pela mensagem mais recente.

Cada item retorna: dados do cliente, última mensagem (preview), contagem de não lidas e timestamp.
Filtro \`?unreadOnly=true\` exibe apenas conversas com mensagens não lidas.`,
  })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean, description: 'Apenas conversas com mensagens não lidas' })
  @ApiQuery({ name: 'page', required: false, description: 'Padrão: 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Padrão: 20, máx: 100' })
  @ApiResponse({ status: 200, description: 'Lista paginada de conversas com preview da última mensagem' })
  listConversations(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listConversations(pizzeriaId, {
      unreadOnly: unreadOnly === 'true',
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post()
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Iniciar ou retomar conversa com cliente (RF56)',
    description: `Cria uma nova conversa ou retorna a existente (constraint unique por pizzeria + cliente).
Garante que cada cliente tem no máximo uma conversa ativa por pizzaria.`,
  })
  @ApiResponse({ status: 201, description: 'Conversa criada ou retomada' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  getOrCreate(
    @Body() dto: CreateConversationDto,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.chatService.getOrCreateConversation(pizzeriaId, dto);
  }

  @Get(':id')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Detalhes da conversa com últimas 50 mensagens (RF60)',
    description: 'Retorna a conversa com dados do cliente e as últimas 50 mensagens em ordem cronológica.',
  })
  @ApiParam({ name: 'id', description: 'UUID da conversa' })
  @ApiResponse({ status: 200, description: 'Conversa com mensagens' })
  @ApiResponse({ status: 404, description: 'Conversa não encontrada' })
  getConversation(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.chatService.getConversation(pizzeriaId, id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Marcar conversa como lida',
    description: 'Zera o `unreadCount` da conversa. Deve ser chamado quando o atendente abre a janela de chat.',
  })
  @ApiParam({ name: 'id', description: 'UUID da conversa' })
  @ApiResponse({ status: 200, description: 'Conversa marcada como lida' })
  @ApiResponse({ status: 404, description: 'Conversa não encontrada' })
  markAsRead(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
  ) {
    return this.chatService.markAsRead(pizzeriaId, id);
  }

  @Post(':id/assume')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({ summary: 'Assumir conversa sem responsável' })
  assumeConversation(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.assumeConversation(pizzeriaId, id, user.sub);
  }

  @Post(':id/assign')
  @PizzeriaRoles(PizzeriaUserRole.admin)
  @ApiOperation({ summary: 'Atribuir conversa a um atendente' })
  assignConversation(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentPizzeriaRole() role: PizzeriaUserRole,
  ) {
    return this.chatService.assignConversation(pizzeriaId, id, dto, user.sub, role);
  }

  @Post(':id/transfer')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({ summary: 'Transferir conversa para outro atendente' })
  transferConversation(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentPizzeriaRole() role: PizzeriaUserRole,
  ) {
    return this.chatService.assignConversation(pizzeriaId, id, dto, user.sub, role);
  }

  @Delete(':id/assignment')
  @HttpCode(HttpStatus.OK)
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({ summary: 'Remover responsável da conversa' })
  unassignConversation(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentPizzeriaRole() role: PizzeriaUserRole,
  ) {
    return this.chatService.unassignConversation(pizzeriaId, id, user.sub, role);
  }

  @Patch(':id/status')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({ summary: 'Alterar estado da conversa' })
  updateConversationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateConversationStatusDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentPizzeriaRole() role: PizzeriaUserRole,
  ) {
    return this.chatService.updateConversationStatus(pizzeriaId, id, dto, user.sub, role);
  }

  // -------------------------------------------------------------------------
  // Mensagens
  // -------------------------------------------------------------------------

  @Post(':id/messages')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Enviar mensagem (RF61/RF57/RF59)',
    description: `Envia uma mensagem da equipe na conversa. Suporta texto e emojis (RF61).

O remetente é sempre derivado do usuário autenticado; o cliente não pode
forjar mensagens de cliente ou de sistema.

**RF59 — Cardápio digital:** envie o link do cardápio no campo \`content\` com \`senderType: "attendant"\`.

Mensagens automáticas internas são criadas por serviços do backend.`,
  })
  @ApiParam({ name: 'id', description: 'UUID da conversa' })
  @ApiResponse({ status: 201, description: 'Mensagem enviada' })
  @ApiResponse({ status: 404, description: 'Conversa não encontrada' })
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentPizzeriaRole() role: PizzeriaUserRole,
  ) {
    return this.chatService.sendMessage(pizzeriaId, id, dto, user.sub, role);
  }

  @Post(':id/messages/template')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Enviar mensagem a partir de template (RF62)',
    description: 'Usa o conteúdo de um template ativo como mensagem. Enviada com senderType `attendant`.',
  })
  @ApiParam({ name: 'id', description: 'UUID da conversa' })
  @ApiResponse({ status: 201, description: 'Mensagem do template enviada' })
  @ApiResponse({ status: 404, description: 'Conversa ou template não encontrado' })
  sendTemplateMessage(
    @Param('id') id: string,
    @Body() dto: SendTemplateMessageDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentPizzeriaRole() role: PizzeriaUserRole,
  ) {
    return this.chatService.sendTemplateMessage(pizzeriaId, id, dto, user.sub, role);
  }

  @Post(':id/messages/whatsapp-template')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({ summary: 'Enviar template oficial da WhatsApp Business Platform' })
  @ApiParam({ name: 'id', description: 'UUID da conversa WhatsApp' })
  @ApiResponse({ status: 201, description: 'Template oficial enviado' })
  @ApiResponse({ status: 400, description: 'Parâmetros inválidos ou fora da janela de atendimento' })
  sendWhatsAppTemplateMessage(
    @Param('id') id: string,
    @Body() dto: SendWhatsAppTemplateMessageDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentPizzeriaRole() role: PizzeriaUserRole,
  ) {
    return this.chatService.sendWhatsAppTemplateMessage(pizzeriaId, id, dto, user.sub, role);
  }

  @Get(':id/messages')
  @PizzeriaRoles(PizzeriaUserRole.admin, PizzeriaUserRole.atendente)
  @ApiOperation({
    summary: 'Histórico completo de mensagens (RF60)',
    description: 'Lista mensagens paginadas da conversa, da mais antiga para a mais recente. Padrão: 50 por página, máx: 200.',
  })
  @ApiParam({ name: 'id', description: 'UUID da conversa' })
  @ApiQuery({ name: 'page', required: false, description: 'Padrão: 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Padrão: 50, máx: 200' })
  @ApiResponse({ status: 200, description: 'Histórico paginado de mensagens' })
  @ApiResponse({ status: 404, description: 'Conversa não encontrada' })
  listMessages(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listMessages(pizzeriaId, id, {
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
