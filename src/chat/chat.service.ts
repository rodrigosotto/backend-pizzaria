import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PizzeriaUserRole } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { SendWhatsAppTemplateMessageDto } from './dto/send-whatsapp-template-message.dto';
import { WhatsAppApiError } from '../whatsapp/whatsapp.errors';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ChatGateway } from './chat.gateway';
import { WhatsAppDeliveryQueueService } from '../whatsapp/whatsapp.delivery.queue';

export type { JwtPayload } from '../modules/auth/auth.service';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly whatsappService?: WhatsAppService,
    @Optional() private readonly chatGateway?: ChatGateway,
    @Optional() private readonly deliveryQueue?: WhatsAppDeliveryQueueService,
  ) {}

  private readonly assigneeSelect = {
    id: true,
    name: true,
    email: true,
  } as const;

  // Internal delivery payloads and correlation data never leave the backend.
  private readonly publicMessageSelect = {
    id: true,
    conversationId: true,
    content: true,
    senderType: true,
    senderId: true,
    isAutomatic: true,
    channel: true,
    direction: true,
    messageType: true,
    externalMessageId: true,
    wamid: true,
    status: true,
    statusUpdatedAt: true,
    errorCode: true,
    errorMessage: true,
    externalTimestamp: true,
    mediaId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private async getConversationForOperation(pizzeriaId: string, id: string) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id, pizzeriaId },
      select: {
        id: true,
        pizzeriaId: true,
        status: true,
        assignmentStatus: true,
        assignedToId: true,
        version: true,
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  private async validateAssignmentTarget(pizzeriaId: string, userId: string) {
    const link = await this.prisma.db.userPizzeriaRole.findUnique({
      where: { userId_pizzeriaId: { userId, pizzeriaId } },
      select: {
        isActive: true,
        role: true,
        user: { select: { id: true, name: true, email: true, isActive: true } },
      },
    });

    if (
      !link?.isActive ||
      !link.user.isActive ||
      (link.role !== PizzeriaUserRole.admin && link.role !== PizzeriaUserRole.atendente)
    ) {
      throw new NotFoundException('Atendente não encontrado ou sem acesso à pizzaria');
    }

    return link.user;
  }

  private async getConversationDetails(pizzeriaId: string, id: string) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id, pizzeriaId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        assignedTo: { select: this.assigneeSelect },
        assignedBy: { select: this.assigneeSelect },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

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
          { id: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          assignedTo: { select: this.assigneeSelect },
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

    const conversation = await this.prisma.db.chatConversation.upsert({
      where: {
        pizzeriaId_customerId: { pizzeriaId, customerId: dto.customerId },
      },
      create: { pizzeriaId, customerId: dto.customerId },
      update: {},
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, conversation.id, conversation);
    return conversation;
  }

  /**
   * RF60 — Detalhes da conversa com as últimas 50 mensagens.
   */
  async getConversation(pizzeriaId: string, id: string) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id, pizzeriaId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        assignedTo: { select: this.assigneeSelect },
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 50,
            select: this.publicMessageSelect,
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

    await this.prisma.db.chatConversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });

    // Retorna o mesmo shape usado pela sidebar. Retornar apenas o registro
    // bruto fazia o frontend substituir uma conversa completa por um objeto
    // sem `customer` e `lastMessage`.
    const updated = await this.prisma.db.chatConversation.findFirst({
      where: { id, pizzeriaId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignedTo: { select: this.assigneeSelect },
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { content: true, senderType: true, createdAt: true },
        },
      },
    });

    if (!updated) throw new NotFoundException('Conversa não encontrada');

    const result = {
      ...updated,
      lastMessage: updated.messages[0] ?? null,
      messages: undefined,
    };
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, id, result);
    return result;
  }

  // =========================================================================
  // ASSIGNMENT E CICLO DE VIDA
  // =========================================================================

  async assumeConversation(pizzeriaId: string, id: string, userId: string) {
    await this.validateAssignmentTarget(pizzeriaId, userId);
    const current = await this.getConversationForOperation(pizzeriaId, id);

    if (current.status === 'closed') {
      throw new ForbiddenException('Conversa fechada; reabra antes de assumir');
    }

    const result = await this.prisma.db.chatConversation.updateMany({
      where: {
        id,
        pizzeriaId,
        version: current.version,
        status: { not: 'closed' },
        assignmentStatus: 'unassigned',
        assignedToId: null,
      },
      data: {
        assignedToId: userId,
        assignedAt: new Date(),
        assignedById: userId,
        assignmentStatus: 'assigned',
        status: 'open',
        version: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      throw new ConflictException('Conversa já foi assumida por outro atendente');
    }

    const updated = await this.getConversationDetails(pizzeriaId, id);
    this.chatGateway?.notifyConversationAssigned(pizzeriaId, id, updated);
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, id, updated);
    return updated;
  }

  async assignConversation(
    pizzeriaId: string,
    id: string,
    dto: AssignConversationDto,
    actorId: string,
    actorRole: PizzeriaUserRole,
  ) {
    await this.validateAssignmentTarget(pizzeriaId, dto.userId);
    const current = await this.getConversationForOperation(pizzeriaId, id);

    if (current.status === 'closed') {
      throw new ForbiddenException('Conversa fechada; reabra antes de atribuir');
    }
    if (actorRole !== PizzeriaUserRole.admin && current.assignedToId !== actorId) {
      throw new ForbiddenException('Apenas o responsável atual pode transferir esta conversa');
    }

    const result = await this.prisma.db.chatConversation.updateMany({
      where: { id, pizzeriaId, version: current.version, status: { not: 'closed' } },
      data: {
        assignedToId: dto.userId,
        assignedAt: new Date(),
        assignedById: actorId,
        assignmentStatus: 'assigned',
        status: 'open',
        version: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      throw new ConflictException('Conversa foi alterada por outro operador; recarregue e tente novamente');
    }

    const updated = await this.getConversationDetails(pizzeriaId, id);
    this.chatGateway?.notifyConversationAssigned(pizzeriaId, id, updated);
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, id, updated);
    return updated;
  }

  async unassignConversation(
    pizzeriaId: string,
    id: string,
    actorId: string,
    actorRole: PizzeriaUserRole,
  ) {
    const current = await this.getConversationForOperation(pizzeriaId, id);
    if (actorRole !== PizzeriaUserRole.admin && current.assignedToId !== actorId) {
      throw new ForbiddenException('Apenas o responsável atual pode remover a atribuição');
    }

    const result = await this.prisma.db.chatConversation.updateMany({
      where: { id, pizzeriaId, version: current.version, assignedToId: current.assignedToId },
      data: {
        assignedToId: null,
        assignedAt: null,
        assignedById: null,
        assignmentStatus: 'unassigned',
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictException('Conversa foi alterada por outro operador; recarregue e tente novamente');
    }
    const updated = await this.getConversationDetails(pizzeriaId, id);
    this.chatGateway?.notifyConversationAssigned(pizzeriaId, id, updated);
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, id, updated);
    return updated;
  }

  async updateConversationStatus(
    pizzeriaId: string,
    id: string,
    dto: UpdateConversationStatusDto,
    actorId: string,
    actorRole: PizzeriaUserRole,
  ) {
    const current = await this.getConversationForOperation(pizzeriaId, id);
    if (actorRole !== PizzeriaUserRole.admin && current.assignedToId !== actorId) {
      throw new ForbiddenException('Apenas o responsável atual pode alterar o estado');
    }

    const result = await this.prisma.db.chatConversation.updateMany({
      where: { id, pizzeriaId, version: current.version },
      data: {
        status: dto.status,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictException('Conversa foi alterada por outro operador; recarregue e tente novamente');
    }
    const updated = await this.getConversationDetails(pizzeriaId, id);
    this.chatGateway?.notifyConversationStatusChanged(pizzeriaId, id, updated);
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, id, updated);
    return updated;
  }

  // =========================================================================
  // MENSAGENS — RF57, RF59, RF61
  // =========================================================================

  /**
   * RF61 — Enviar mensagem (texto + emojis).
   * RF57 — Suporta isAutomatic=true para mensagens automáticas do sistema.
   * RF59 — O conteúdo pode ser um link do cardápio digital.
   *
   * Esta operação representa exclusivamente o envio de um atendente
   * autenticado. Mensagens de cliente/sistema não entram por esta rota.
   */
  async sendMessage(
    pizzeriaId: string,
    conversationId: string,
    dto: SendMessageDto,
    senderId: string,
    senderRole: PizzeriaUserRole = PizzeriaUserRole.atendente,
  ) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id: conversationId, pizzeriaId },
      select: {
        id: true,
        status: true,
        assignedToId: true,
        channel: true,
        whatsappAccountId: true,
        customer: { select: { phone: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.status === 'closed') {
      throw new ForbiddenException('Conversa fechada; reabra antes de enviar mensagem');
    }
    if (
      senderRole !== PizzeriaUserRole.admin &&
      conversation.assignedToId &&
      conversation.assignedToId !== senderId
    ) {
      throw new ForbiddenException('Conversa atribuída a outro atendente');
    }

    if (conversation.channel === 'whatsapp') {
      const latestInbound = await this.prisma.db.chatMessage.findFirst({
        where: { conversationId, direction: 'inbound' },
        orderBy: [{ externalTimestamp: 'desc' }, { createdAt: 'desc' }],
        select: { externalTimestamp: true, createdAt: true },
      });
      const lastInboundAt = latestInbound?.externalTimestamp ?? latestInbound?.createdAt ?? null;
      if (!this.whatsappService?.isWithinServiceWindow(lastInboundAt)) {
        throw new BadRequestException('Fora da janela de atendimento; use um template oficial aprovado');
      }
      return this.sendWhatsAppMessage(pizzeriaId, conversation, dto.content, senderId);
    }

    const [message] = await this.prisma.db.$transaction([
      this.prisma.db.chatMessage.create({
        data: {
          conversationId,
          content: dto.content,
          // Esta rota representa uma ação do atendente autenticado. Mensagens
          // de cliente/sistema devem ter entradas próprias no backend.
          senderType: 'attendant',
          senderId,
          isAutomatic: false,
        },
      }),
      this.prisma.db.chatConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          unreadCount: 0,
        },
      }),
    ]);

    this.chatGateway?.notifyMessageCreated(pizzeriaId, conversationId, message);
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, conversationId, {
      id: conversationId,
      pizzeriaId,
      lastMessageAt: message.createdAt,
      unreadCount: 0,
      lastMessage: message,
    });
    return message;
  }

  private async sendWhatsAppMessage(
    pizzeriaId: string,
    conversation: {
      id: string;
      whatsappAccountId: string | null;
      customer: { phone: string };
    },
    content: string,
    senderId: string,
  ) {
    if (!this.whatsappService) {
      throw new WhatsAppApiError('provider', 'WhatsApp service is unavailable');
    }
    if (!conversation.whatsappAccountId) {
      throw new NotFoundException('Conversa WhatsApp sem conta configurada');
    }

    const account = await this.prisma.db.whatsAppAccount.findFirst({
      where: { id: conversation.whatsappAccountId, pizzeriaId, status: 'active' },
      select: { id: true, phoneNumberId: true },
    });
    if (!account) throw new NotFoundException('Conta WhatsApp não encontrada ou inativa');

    const queuedAt = new Date();
    const [message] = await this.prisma.db.$transaction([
      this.prisma.db.chatMessage.create({
        data: {
          conversationId: conversation.id,
          content,
          senderType: 'attendant',
          senderId,
          isAutomatic: false,
          channel: 'whatsapp',
          direction: 'outbound',
          messageType: 'text',
          status: 'queued',
          statusUpdatedAt: queuedAt,
          correlationId: randomUUID(),
          deliveryPayload: { to: conversation.customer.phone, body: content },
        },
      }),
      this.prisma.db.chatConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: queuedAt, unreadCount: 0 },
      }),
    ]);
    this.chatGateway?.notifyMessageCreated(pizzeriaId, conversation.id, message);

    if (this.deliveryQueue) {
      this.deliveryQueue.enqueue(message.id, message.correlationId ?? undefined);
      this.chatGateway?.notifyConversationUpdated(pizzeriaId, conversation.id, {
        id: conversation.id, pizzeriaId, lastMessageAt: message.createdAt, unreadCount: 0, lastMessage: message,
      });
      return message;
    }

    try {
      const response = await this.whatsappService.sendTextForAccount(account, {
        to: conversation.customer.phone,
        body: content,
      });
      const wamid = response.messages?.[0]?.id;
      if (!wamid) throw new WhatsAppApiError('provider', 'WhatsApp API returned no message id');

      const sentMessage = await this.prisma.db.chatMessage.update({
        where: { id: message.id },
        data: {
          wamid,
          externalMessageId: wamid,
          status: 'sent',
          statusUpdatedAt: new Date(),
        },
      });
      this.chatGateway?.notifyMessageUpdated(pizzeriaId, conversation.id, sentMessage);
      this.chatGateway?.notifyConversationUpdated(pizzeriaId, conversation.id, {
        id: conversation.id,
        pizzeriaId,
        lastMessageAt: sentMessage.createdAt,
        unreadCount: 0,
        lastMessage: sentMessage,
      });
      return sentMessage;
    } catch (error) {
      const apiError = error instanceof WhatsAppApiError
        ? error
        : new WhatsAppApiError('unknown', 'WhatsApp message delivery failed');
      const failedMessage = await this.prisma.db.chatMessage.update({
        where: { id: message.id },
        data: {
          status: 'failed',
          statusUpdatedAt: new Date(),
          errorCode: apiError.providerCode?.toString() ?? apiError.statusCode?.toString() ?? apiError.kind,
          errorMessage: apiError.message.slice(0, 500),
        },
      });
      this.chatGateway?.notifyMessageUpdated(pizzeriaId, conversation.id, failedMessage);
      throw apiError;
    }
  }

  async sendWhatsAppTemplateMessage(
    pizzeriaId: string,
    conversationId: string,
    dto: SendWhatsAppTemplateMessageDto,
    senderId: string,
    senderRole: PizzeriaUserRole = PizzeriaUserRole.atendente,
  ) {
    const conversation = await this.prisma.db.chatConversation.findFirst({
      where: { id: conversationId, pizzeriaId },
      select: {
        id: true,
        status: true,
        assignedToId: true,
        channel: true,
        whatsappAccountId: true,
        customer: { select: { phone: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.status === 'closed') throw new ForbiddenException('Conversa fechada; reabra antes de enviar');
    if (senderRole !== PizzeriaUserRole.admin && conversation.assignedToId && conversation.assignedToId !== senderId) {
      throw new ForbiddenException('Conversa atribuída a outro atendente');
    }
    if (conversation.channel !== 'whatsapp' || !conversation.whatsappAccountId) {
      throw new BadRequestException('Templates oficiais só podem ser enviados em conversas WhatsApp');
    }
    if (!this.whatsappService) throw new WhatsAppApiError('provider', 'WhatsApp service is unavailable');

    const account = await this.prisma.db.whatsAppAccount.findFirst({
      where: { id: conversation.whatsappAccountId, pizzeriaId, status: 'active' },
      select: { id: true, phoneNumberId: true },
    });
    if (!account) throw new NotFoundException('Conta WhatsApp não encontrada ou inativa');

    const template = await this.prisma.db.whatsAppTemplate.findFirst({
      where: {
        id: dto.templateId,
        pizzeriaId,
        whatsappAccountId: account.id,
        language: dto.language,
        status: 'approved',
      },
    });
    if (!template) throw new NotFoundException('Template oficial não encontrado, não autorizado ou idioma inválido');

    const parameters = dto.parameters ?? [];
    if (parameters.length !== template.parameterCount) {
      throw new BadRequestException(`Template exige ${template.parameterCount} parâmetro(s)`);
    }

    const queuedAt = new Date();
    const [message] = await this.prisma.db.$transaction([
      this.prisma.db.chatMessage.create({
        data: {
          conversationId,
          content: `[WhatsApp template] ${template.name}`,
          senderType: 'attendant',
          senderId,
          isAutomatic: false,
          channel: 'whatsapp',
          direction: 'outbound',
          messageType: 'template',
          status: 'queued',
          statusUpdatedAt: queuedAt,
          correlationId: randomUUID(),
          deliveryPayload: { to: conversation.customer.phone, name: template.name, language: template.language, parameters },
        },
      }),
      this.prisma.db.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: queuedAt, unreadCount: 0 },
      }),
    ]);

    this.chatGateway?.notifyMessageCreated(pizzeriaId, conversation.id, message);
    if (this.deliveryQueue) {
      this.deliveryQueue.enqueue(message.id, message.correlationId ?? undefined);
      this.chatGateway?.notifyConversationUpdated(pizzeriaId, conversation.id, {
        id: conversation.id, pizzeriaId, lastMessageAt: message.createdAt, unreadCount: 0, lastMessage: message,
      });
      return message;
    }

    try {
      const response = await this.whatsappService.sendTemplateForAccount(account, {
        to: conversation.customer.phone,
        name: template.name,
        language: template.language,
        parameters,
      });
      const wamid = response.messages?.[0]?.id;
      if (!wamid) throw new WhatsAppApiError('provider', 'WhatsApp API returned no message id');
      return this.prisma.db.chatMessage.update({
        where: { id: message.id },
        data: { wamid, externalMessageId: wamid, status: 'sent', statusUpdatedAt: new Date() },
      });
    } catch (error) {
      const apiError = error instanceof WhatsAppApiError ? error : new WhatsAppApiError('unknown', 'WhatsApp template delivery failed');
      await this.prisma.db.chatMessage.update({
        where: { id: message.id },
        data: {
          status: 'failed',
          statusUpdatedAt: new Date(),
          errorCode: apiError.providerCode?.toString() ?? apiError.statusCode?.toString() ?? apiError.kind,
          errorMessage: apiError.message.slice(0, 500),
        },
      });
      throw apiError;
    }
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: this.publicMessageSelect,
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
    senderRole: PizzeriaUserRole = PizzeriaUserRole.atendente,
  ) {
    const template = await this.prisma.db.chatTemplate.findFirst({
      where: { id: dto.templateId, pizzeriaId, isActive: true },
    });
    if (!template) throw new NotFoundException('Template não encontrado ou inativo');

    return this.sendMessage(
      pizzeriaId,
      conversationId,
      { content: template.content },
      senderId,
      senderRole,
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
    const customer = await this.prisma.db.customer.findFirst({
      where: { id: customerId, pizzeriaId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

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

    this.chatGateway?.notifyMessageCreated(pizzeriaId, conversation.id, message);
    this.chatGateway?.notifyConversationUpdated(pizzeriaId, conversation.id, {
      id: conversation.id,
      pizzeriaId,
      lastMessageAt: message.createdAt,
      unreadCount: 0,
      lastMessage: message,
    });
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

  async listWhatsAppTemplates(pizzeriaId: string) {
    return this.prisma.db.whatsAppTemplate.findMany({
      where: { pizzeriaId, status: 'approved' },
      orderBy: [{ name: 'asc' }, { language: 'asc' }],
      select: {
        id: true,
        pizzeriaId: true,
        whatsappAccountId: true,
        name: true,
        language: true,
        category: true,
        status: true,
        parameterCount: true,
        metadata: true,
      },
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
