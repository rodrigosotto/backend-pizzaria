import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

export type { JwtPayload } from '../modules/auth/auth.service';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // CONVERSAS — RF56, RF59, RF60
  // =========================================================================

  /**
   * RF56 — Lista de conversas estilo WhatsApp: ordenadas pela última mensagem,
   * com dados do cliente e contagem de não lidas.
   */
  async listConversations(
    pizzeriaId: string,
    filters: { unreadOnly?: boolean; page?: number; limit?: number },
  ) {
    const page  = filters.page  ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip  = (page - 1) * limit;

    const where = {
      pizzeriaId,
      ...(filters.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
    };

    const [conversations, total] = await this.prisma.db.$transaction([
      this.prisma.db.chatConversation.findMany({
        where,
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, senderType: true, createdAt: true },
          },
        },
      }),
      this.prisma.db.chatConversation.count({ where }),
    ]);

    return {
      conversations: conversations.map((c) => ({
        ...c,
        lastMessage: c.messages[0] ?? null,
        messages: undefined,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * RF56 — Buscar ou criar conversa com um cliente.
   * Usa a constraint unique (pizzeriaId, customerId) para garantir uma conversa por cliente.
   */
  async getOrCreateConversation(pizzeriaId: string, dto: CreateConversationDto) {
    const customer = await this.prisma.db.customer.findFirst({
      where: { id: dto.customerId, pizzeriaId },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    return this.prisma.db.chatConversation.upsert({
      where: {
        pizzeriaId_customerId: { pizzeriaId, customerId: dto.customerId },
      },
      create: { pizzeriaId, customerId: dto.customerId },
      update: {},
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  /**
   * RF60 — Detalhes da conversa com as últimas 50 mensagens.
   */
  async getConversation(pizzeriaId: string, id: string) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id, pizzeriaId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    return {
      ...conversation,
      messages: conversation.messages.reverse(), // cronológico para o frontend
    };
  }

  /**
   * Marcar conversa como lida — zera unreadCount.
   */
  async markAsRead(pizzeriaId: string, id: string) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id, pizzeriaId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    return this.prisma.db.chatConversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
  }

  // =========================================================================
  // MENSAGENS — RF57, RF59, RF61
  // =========================================================================

  /**
   * RF61 — Enviar mensagem (texto + emojis).
   * RF57 — Suporta isAutomatic=true para mensagens automáticas do sistema.
   * RF59 — O conteúdo pode ser um link do cardápio digital.
   *
   * Lógica de unreadCount:
   * - senderType 'customer': incrementa unreadCount (mensagem não lida pela equipe)
   * - senderType 'attendant' ou 'system': zera unreadCount (equipe está ativa na conversa)
   */
  async sendMessage(
    pizzeriaId: string,
    conversationId: string,
    dto: SendMessageDto,
    senderId: string,
  ) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id: conversationId, pizzeriaId },
      select: { id: true, unreadCount: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const senderType = dto.senderType ?? 'attendant';
    const isCustomer = senderType === 'customer';

    const [message] = await this.prisma.db.$transaction([
      this.prisma.db.chatMessage.create({
        data: {
          conversationId,
          content: dto.content,
          senderType,
          senderId: senderType !== 'system' ? senderId : undefined,
          isAutomatic: dto.isAutomatic ?? false,
        },
      }),
      this.prisma.db.chatConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          unreadCount: isCustomer
            ? { increment: 1 }
            : 0,
        },
      }),
    ]);

    return message;
  }

  /**
   * RF60 — Histórico completo de mensagens da conversa, paginado.
   */
  async listMessages(
    pizzeriaId: string,
    conversationId: string,
    filters: { page?: number; limit?: number },
  ) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id: conversationId, pizzeriaId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const page  = filters.page  ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip  = (page - 1) * limit;

    const [messages, total] = await this.prisma.db.$transaction([
      this.prisma.db.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.db.chatMessage.count({ where: { conversationId } }),
    ]);

    return {
      messages: messages.reverse(), // do mais antigo para o mais novo
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * RF62 — Enviar mensagem usando um template (resposta rápida).
   */
  async sendTemplateMessage(
    pizzeriaId: string,
    conversationId: string,
    dto: SendTemplateMessageDto,
    senderId: string,
  ) {
    const template = await this.prisma.db.chatTemplate.findFirst({
      where: { id: dto.templateId, pizzeriaId, isActive: true },
    });
    if (!template) throw new NotFoundException('Template não encontrado ou inativo');

    return this.sendMessage(
      pizzeriaId,
      conversationId,
      { content: template.content, senderType: 'attendant' },
      senderId,
    );
  }

  /**
   * RF57 — Enviar mensagem automática pelo sistema (ex: confirmação de pedido,
   * saída para entrega, entrega realizada). Cria a conversa se ainda não existir.
   * Deve ser chamado por outros serviços (ex: OrdersService ao mudar status).
   */
  async sendAutoMessage(
    pizzeriaId: string,
    customerId: string,
    content: string,
  ) {
    // Garante que a conversa existe
    const conversation = await this.prisma.db.chatConversation.upsert({
      where: { pizzeriaId_customerId: { pizzeriaId, customerId } },
      create: { pizzeriaId, customerId },
      update: {},
      select: { id: true },
    });

    const [message] = await this.prisma.db.$transaction([
      this.prisma.db.chatMessage.create({
        data: {
          conversationId: conversation.id,
          content,
          senderType: 'system',
          isAutomatic: true,
        },
      }),
      this.prisma.db.chatConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  // =========================================================================
  // TEMPLATES — RF57, RF62
  // =========================================================================

  /** RF62 — Listar templates de resposta rápida da pizzaria. */
  async listTemplates(pizzeriaId: string, activeOnly = true) {
    const where = {
      pizzeriaId,
      ...(activeOnly ? { isActive: true } : {}),
    };

    return this.prisma.db.chatTemplate.findMany({
      where,
      orderBy: { title: 'asc' },
    });
  }

  /** RF62 / RF57 — Criar template de mensagem rápida. */
  async createTemplate(pizzeriaId: string, dto: CreateTemplateDto, userId: string) {
    const template = await this.prisma.db.chatTemplate.create({
      data: { pizzeriaId, title: dto.title, content: dto.content },
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'chat.template.create',
      entity: 'ChatTemplate',
      entityId: template.id,
      after: { title: template.title },
    });

    return template;
  }

  /** RF62 — Atualizar template (conteúdo, título ou ativar/desativar). */
  async updateTemplate(
    pizzeriaId: string,
    id: string,
    dto: UpdateTemplateDto,
    userId: string,
  ) {
    const template = await this.prisma.db.chatTemplate.findFirst({
      where: { id, pizzeriaId },
    });
    if (!template) throw new NotFoundException('Template não encontrado');

    const updated = await this.prisma.db.chatTemplate.update({
      where: { id },
      data: {
        title:    dto.title,
        content:  dto.content,
        isActive: dto.isActive,
      },
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'chat.template.update',
      entity: 'ChatTemplate',
      entityId: id,
      before: { title: template.title, isActive: template.isActive },
      after:  { title: updated.title,  isActive: updated.isActive },
    });

    return updated;
  }

  /** Remover template. */
  async removeTemplate(pizzeriaId: string, id: string, userId: string) {
    const template = await this.prisma.db.chatTemplate.findFirst({
      where: { id, pizzeriaId },
    });
    if (!template) throw new NotFoundException('Template não encontrado');

    await this.prisma.db.chatTemplate.delete({ where: { id } });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'chat.template.delete',
      entity: 'ChatTemplate',
      entityId: id,
      before: { title: template.title },
    });

    return { deleted: true };
  }
}
