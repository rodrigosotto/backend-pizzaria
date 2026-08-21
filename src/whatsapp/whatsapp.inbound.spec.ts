import { ChatChannel, ChatMessageDirection, ChatMessageStatus, ChatMessageType } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import { ParsedWhatsAppWebhook, WhatsAppInboundMessage } from './whatsapp.webhook.types';

describe('WhatsAppInboundService', () => {
  const message: WhatsAppInboundMessage = {
    businessAccountId: 'business-1',
    phoneNumberId: 'phone-1',
    wamid: 'wamid.1',
    from: '5511999999999',
    timestamp: new Date('2026-08-20T12:00:00.000Z'),
    type: 'text',
    text: 'Pedido recebido',
    profileName: 'Cliente Fixture',
  };

  function parsed(overrides: Partial<ParsedWhatsAppWebhook> = {}): ParsedWhatsAppWebhook {
    return {
      entryCount: 1,
      changeCount: 1,
      messageIds: [message.wamid],
      statusIds: [],
      messages: [message],
      ...overrides,
    };
  }

  function makeTx(options?: { existingMessage?: boolean; existingCustomer?: boolean; existingConversation?: boolean }) {
    const tx = {
      whatsAppAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'account-1', pizzeriaId: 'pizzeria-1', status: 'active', businessAccountId: 'business-1' }),
      },
      customer: {
        upsert: jest.fn().mockResolvedValue({ id: options?.existingCustomer ? 'customer-existing' : 'customer-new' }),
      },
      chatConversation: {
        upsert: jest.fn().mockResolvedValue({ id: options?.existingConversation ? 'conversation-existing' : 'conversation-new', lastMessageAt: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue(options?.existingMessage ? { id: 'message-existing' } : null),
        create: jest.fn().mockResolvedValue({ id: 'message-new' }),
      },
    };
    return tx;
  }

  function makeService(tx: ReturnType<typeof makeTx>) {
    const prisma = { db: { $transaction: jest.fn((callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) } } as unknown as PrismaService;
    return { service: new WhatsAppInboundService(prisma), prisma };
  }

  it('creates customer, conversation and inbound message atomically for a new contact', async () => {
    const tx = makeTx();
    const { service, prisma } = makeService(tx);
    await expect(service.process(parsed())).resolves.toEqual({ processed: 1, duplicates: 0, skipped: 0 });
    expect(prisma.db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.customer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { pizzeriaId_phone: { pizzeriaId: 'pizzeria-1', phone: '5511999999999' } },
    }));
    expect(tx.chatConversation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ pizzeriaId: 'pizzeria-1', customerId: 'customer-new', whatsappAccountId: 'account-1', channel: ChatChannel.whatsapp }),
    }));
    expect(tx.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        senderType: 'customer',
        senderId: 'customer-new',
        channel: ChatChannel.whatsapp,
        direction: ChatMessageDirection.inbound,
        messageType: ChatMessageType.text,
        wamid: 'wamid.1',
        status: ChatMessageStatus.delivered,
      }),
    }));
    expect(tx.chatConversation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unreadCount: { increment: 1 } }) }));
  });

  it('reuses existing customer and conversation and ignores a duplicate wamid', async () => {
    const tx = makeTx({ existingMessage: true, existingCustomer: true, existingConversation: true });
    const { service } = makeService(tx);
    await expect(service.process(parsed())).resolves.toEqual({ processed: 0, duplicates: 1, skipped: 0 });
    expect(tx.chatMessage.create).not.toHaveBeenCalled();
    expect(tx.chatConversation.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown or inactive tenant account', async () => {
    const tx = makeTx();
    tx.whatsAppAccount.findUnique.mockResolvedValue(null);
    const { service } = makeService(tx);
    await expect(service.process(parsed())).rejects.toThrow('WhatsApp account not found or inactive');
    expect(tx.customer.upsert).not.toHaveBeenCalled();
  });

  it('skips unsupported media while preserving the webhook acknowledgement path', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);
    await expect(service.process(parsed({ messages: [], messageIds: [message.wamid] }))).resolves.toEqual({ processed: 0, duplicates: 0, skipped: 1 });
    expect(tx.chatMessage.create).not.toHaveBeenCalled();
  });

  it('serializes each inbound message through a transaction', async () => {
    const tx = makeTx();
    const { service, prisma } = makeService(tx);
    await service.process(parsed({ messages: [message, { ...message, wamid: 'wamid.2', text: 'Segundo' }], messageIds: ['wamid.1', 'wamid.2'] }));
    expect(prisma.db.$transaction).toHaveBeenCalledTimes(2);
  });
});
