import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PizzeriaUserRole } from '@prisma/client';
import { ChatService } from './chat.service';

describe('ChatService official WhatsApp templates', () => {
  const audit = { log: jest.fn() } as any;

  function makeContext(options: {
    template?: any;
    account?: any;
    conversation?: any;
    response?: any;
  } = {}) {
    const prisma = {
      db: {
        chatConversation: {
          findFirst: jest.fn().mockResolvedValue(options.conversation ?? {
            id: 'conversation-1', status: 'open', assignedToId: 'user-1', channel: 'whatsapp',
            whatsappAccountId: 'account-1', customer: { phone: '5511999999999' },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        chatMessage: {
          create: jest.fn().mockResolvedValue({ id: 'message-1', status: 'queued' }),
          update: jest.fn().mockResolvedValue({ id: 'message-1', status: 'sent', wamid: 'wamid.template.1' }),
        },
        whatsAppAccount: {
          findFirst: jest.fn().mockResolvedValue(options.account ?? { id: 'account-1', phoneNumberId: 'phone-1' }),
        },
        whatsAppTemplate: {
          findFirst: jest.fn().mockResolvedValue(options.template !== undefined ? options.template : {
            id: 'template-1', name: 'order_update', language: 'pt_BR', parameterCount: 2, status: 'approved',
          }),
        },
        $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
      },
    };
    const whatsapp = {
      sendTemplateForAccount: jest.fn().mockResolvedValue(options.response ?? {
        messaging_product: 'whatsapp', messages: [{ id: 'wamid.template.1' }],
      }),
    };
    return { prisma, whatsapp, service: new ChatService(prisma as any, audit, whatsapp as any) };
  }

  const dto = { templateId: 'template-1', language: 'pt_BR', parameters: ['Maria', '25'] };

  it('sends an approved template and persists its external id', async () => {
    const { prisma, whatsapp, service } = makeContext();
    await expect(service.sendWhatsAppTemplateMessage('pizzeria-1', 'conversation-1', dto, 'user-1', PizzeriaUserRole.atendente))
      .resolves.toEqual(expect.objectContaining({ id: 'message-1' }));

    expect(whatsapp.sendTemplateForAccount).toHaveBeenCalledWith(
      { id: 'account-1', phoneNumberId: 'phone-1' },
      { to: '5511999999999', name: 'order_update', language: 'pt_BR', parameters: ['Maria', '25'] },
    );
    expect(prisma.db.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ messageType: 'template', status: 'queued', channel: 'whatsapp' }),
    }));
    expect(prisma.db.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'sent', wamid: 'wamid.template.1', externalMessageId: 'wamid.template.1' }),
    }));
  });

  it('rejects missing template parameters before sending', async () => {
    const { prisma, whatsapp, service } = makeContext();
    await expect(service.sendWhatsAppTemplateMessage('pizzeria-1', 'conversation-1', {
      ...dto, parameters: ['Maria'],
    }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.db.chatMessage.create).not.toHaveBeenCalled();
    expect(whatsapp.sendTemplateForAccount).not.toHaveBeenCalled();
  });

  it('rejects an unknown or unauthorized template', async () => {
    const { prisma, whatsapp, service } = makeContext({ template: null });
    await expect(service.sendWhatsAppTemplateMessage('pizzeria-1', 'conversation-1', dto, 'user-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.chatMessage.create).not.toHaveBeenCalled();
    expect(whatsapp.sendTemplateForAccount).not.toHaveBeenCalled();
  });

  it('rejects an invalid language because lookup is account and language scoped', async () => {
    const { prisma, whatsapp, service } = makeContext({ template: null });
    await expect(service.sendWhatsAppTemplateMessage('pizzeria-1', 'conversation-1', {
      ...dto, language: 'en_US',
    }, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.whatsAppTemplate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ language: 'en_US', status: 'approved', pizzeriaId: 'pizzeria-1' }),
    }));
    expect(whatsapp.sendTemplateForAccount).not.toHaveBeenCalled();
  });

  it('keeps the service-window rule on the backend for free-form text', async () => {
    const prisma = {
      db: {
        chatConversation: { findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-1', status: 'open', assignedToId: 'user-1', channel: 'whatsapp', whatsappAccountId: 'account-1',
          customer: { phone: '5511999999999' },
        }) },
        chatMessage: { findFirst: jest.fn().mockResolvedValue({ externalTimestamp: new Date(Date.now() - 25 * 60 * 60 * 1000), createdAt: new Date() }) },
      },
    };
    const whatsapp = { isWithinServiceWindow: jest.fn().mockReturnValue(false), sendTextForAccount: jest.fn() };
    const service = new ChatService(prisma as any, audit, whatsapp as any);
    await expect(service.sendMessage('pizzeria-1', 'conversation-1', { content: 'Fora da janela' }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(whatsapp.isWithinServiceWindow).toHaveBeenCalled();
    expect(whatsapp.sendTextForAccount).not.toHaveBeenCalled();
  });
});
