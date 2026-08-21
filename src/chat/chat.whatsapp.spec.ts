import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PizzeriaUserRole } from '@prisma/client';
import { ChatService } from './chat.service';
import { WhatsAppApiError } from '../whatsapp/whatsapp.errors';

describe('ChatService WhatsApp outbound messages', () => {
  const audit = { log: jest.fn() } as any;

  function makeContext(options: {
    conversation?: any;
    account?: any;
    apiError?: WhatsAppApiError;
    response?: any;
  } = {}) {
    const prisma = {
      db: {
        chatConversation: {
          findFirst: jest.fn().mockResolvedValue(options.conversation !== undefined ? options.conversation : {
            id: 'conversation-1',
            status: 'open',
            assignedToId: 'user-1',
            channel: 'whatsapp',
            whatsappAccountId: 'account-1',
            customer: { phone: '5511999999999' },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        chatMessage: {
          create: jest.fn().mockResolvedValue({ id: 'message-1', status: 'queued' }),
          update: jest.fn().mockResolvedValue({ id: 'message-1', status: 'sent', wamid: 'wamid.sent.1' }),
          findFirst: jest.fn().mockResolvedValue({ externalTimestamp: new Date(), createdAt: new Date() }),
        },
        whatsAppAccount: {
          findFirst: jest.fn().mockResolvedValue(options.account !== undefined ? options.account : { id: 'account-1', phoneNumberId: 'phone-1' }),
        },
        $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
      },
    };
    const whatsapp = {
      isWithinServiceWindow: jest.fn().mockReturnValue(true),
      sendTextForAccount: jest.fn().mockImplementation(() => {
        if (options.apiError) return Promise.reject(options.apiError);
        return Promise.resolve(options.response ?? { messaging_product: 'whatsapp', messages: [{ id: 'wamid.sent.1' }] });
      }),
    };
    return { prisma, whatsapp, service: new ChatService(prisma as any, audit, whatsapp as any) };
  }

  it('creates queued message, sends text and persists wamid as sent', async () => {
    const { prisma, whatsapp, service } = makeContext();
    await expect(service.sendMessage('pizzeria-1', 'conversation-1', { content: 'Olá' }, 'user-1', PizzeriaUserRole.atendente))
      .resolves.toEqual(expect.objectContaining({ id: 'message-1' }));

    expect(prisma.db.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        channel: 'whatsapp',
        direction: 'outbound',
        senderType: 'attendant',
        senderId: 'user-1',
        status: 'queued',
      }),
    }));
    expect(whatsapp.sendTextForAccount).toHaveBeenCalledWith(
      { id: 'account-1', phoneNumberId: 'phone-1' },
      { to: '5511999999999', body: 'Olá' },
    );
    expect(prisma.db.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1' },
      data: expect.objectContaining({ status: 'sent', wamid: 'wamid.sent.1', externalMessageId: 'wamid.sent.1' }),
    }));
  });

  it.each([
    ['bad_request', 400],
    ['unauthorized', 401],
    ['rate_limited', 429],
    ['timeout', 504],
  ] as const)('persists failed status for Meta %s errors', async (kind, status) => {
    const apiError = new WhatsAppApiError(kind, `Meta ${kind}`, status, 131000);
    const { prisma, service } = makeContext({ apiError });

    await expect(service.sendMessage('pizzeria-1', 'conversation-1', { content: 'Olá' }, 'user-1')).rejects.toBe(apiError);
    expect(prisma.db.chatMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', errorCode: '131000' }),
    }));
  });

  it('blocks another tenant before creating or sending a message', async () => {
    const { prisma, whatsapp, service } = makeContext({ conversation: null });
    await expect(service.sendMessage('pizzeria-2', 'conversation-1', { content: 'Olá' }, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.chatMessage.create).not.toHaveBeenCalled();
    expect(whatsapp.sendTextForAccount).not.toHaveBeenCalled();
  });

  it('blocks a closed conversation', async () => {
    const { prisma, whatsapp, service } = makeContext({ conversation: {
      id: 'conversation-1', status: 'closed', assignedToId: 'user-1', channel: 'whatsapp', whatsappAccountId: 'account-1', customer: { phone: '5511999999999' },
    } });
    await expect(service.sendMessage('pizzeria-1', 'conversation-1', { content: 'Olá' }, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.db.chatMessage.create).not.toHaveBeenCalled();
    expect(whatsapp.sendTextForAccount).not.toHaveBeenCalled();
  });

  it('blocks an unauthorized assigned operator', async () => {
    const { prisma, whatsapp, service } = makeContext({ conversation: {
      id: 'conversation-1', status: 'open', assignedToId: 'user-2', channel: 'whatsapp', whatsappAccountId: 'account-1', customer: { phone: '5511999999999' },
    } });
    await expect(service.sendMessage('pizzeria-1', 'conversation-1', { content: 'Olá' }, 'user-1', PizzeriaUserRole.atendente)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.db.chatMessage.create).not.toHaveBeenCalled();
    expect(whatsapp.sendTextForAccount).not.toHaveBeenCalled();
  });

  it('blocks a WhatsApp conversation without an active account', async () => {
    const { prisma, whatsapp, service } = makeContext({ account: null });
    await expect(service.sendMessage('pizzeria-1', 'conversation-1', { content: 'Olá' }, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.chatMessage.create).not.toHaveBeenCalled();
    expect(whatsapp.sendTextForAccount).not.toHaveBeenCalled();
  });
});
