import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PizzeriaUserRole } from '@prisma/client';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  const audit = { log: jest.fn() } as any;

  const makePrisma = () => ({
    db: {
      chatConversation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      userPizzeriaRole: {
        findUnique: jest.fn(),
      },
      chatMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    },
  });

  it('força mensagens da rota autenticada a serem de atendente', async () => {
    const prisma = makePrisma();
    prisma.db.chatConversation.findFirst.mockResolvedValue({ id: 'conversation-1' });
    prisma.db.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    prisma.db.chatMessage.create.mockResolvedValue({
      id: 'message-1',
      senderType: 'attendant',
      senderId: 'user-1',
    });
    const service = new ChatService(prisma as any, audit);

    await service.sendMessage(
      'pizzeria-1',
      'conversation-1',
      { content: 'mensagem', senderType: 'customer', isAutomatic: true } as any,
      'user-1',
    );

    expect(prisma.db.chatMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conversation-1',
        content: 'mensagem',
        senderType: 'attendant',
        senderId: 'user-1',
        isAutomatic: false,
      },
    });
    expect(prisma.db.chatConversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { lastMessageAt: expect.any(Date), unreadCount: 0 },
    });
  });

  it('retorna a conversa completa ao marcar como lida', async () => {
    const prisma = makePrisma();
    prisma.db.chatConversation.findFirst
      .mockResolvedValueOnce({ id: 'conversation-1' })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        pizzeriaId: 'pizzeria-1',
        customerId: 'customer-1',
        unreadCount: 0,
        customer: { id: 'customer-1', name: 'Cliente', phone: '5511999999999' },
        messages: [{ content: 'oi', senderType: 'customer', createdAt: new Date() }],
      });
    prisma.db.chatConversation.update.mockResolvedValue({});
    const service = new ChatService(prisma as any, audit);

    const result = await service.markAsRead('pizzeria-1', 'conversation-1');

    expect(result).toEqual(expect.objectContaining({
      id: 'conversation-1',
      unreadCount: 0,
      customer: expect.objectContaining({ name: 'Cliente' }),
      lastMessage: expect.objectContaining({ content: 'oi' }),
    }));
    expect(result.messages).toBeUndefined();
    expect(prisma.db.chatConversation.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'conversation-1', pizzeriaId: 'pizzeria-1' },
    }));
  });

  it('mantém o isolamento por pizzaria ao consultar mensagens', async () => {
    const prisma = makePrisma();
    prisma.db.chatConversation.findFirst.mockResolvedValue({ id: 'conversation-1' });
    prisma.db.chatMessage.findMany.mockResolvedValue([]);
    prisma.db.chatMessage.count.mockResolvedValue(0);
    prisma.db.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    const service = new ChatService(prisma as any, audit);

    await service.listMessages('pizzeria-1', 'conversation-1', { page: 1, limit: 50 });

    expect(prisma.db.chatConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversation-1', pizzeriaId: 'pizzeria-1' },
      select: { id: true },
    });
    expect(prisma.db.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: 'conversation-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 50,
      select: expect.objectContaining({ content: true, wamid: true }),
    }));
  });

  it('bloqueia mensagens quando a conversa pertence a outra pizzaria', async () => {
    const prisma = makePrisma();
    prisma.db.chatConversation.findFirst.mockResolvedValue(null);
    const service = new ChatService(prisma as any, audit);

    await expect(
      service.sendMessage('pizzeria-2', 'conversation-1', { content: 'mensagem' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.$transaction).not.toHaveBeenCalled();
  });

  it('permite assumir uma conversa sem responsável', async () => {
    const prisma = makePrisma();
    prisma.db.userPizzeriaRole.findUnique.mockResolvedValue({
      isActive: true,
      role: PizzeriaUserRole.atendente,
      user: { id: 'user-a', name: 'A', email: 'a@test', isActive: true },
    });
    prisma.db.chatConversation.findFirst
      .mockResolvedValueOnce({
        id: 'conversation-1',
        pizzeriaId: 'pizzeria-1',
        status: 'open',
        assignmentStatus: 'unassigned',
        assignedToId: null,
        version: 0,
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        assignedToId: 'user-a',
        status: 'open',
        assignedTo: { id: 'user-a', name: 'A', email: 'a@test' },
      });
    prisma.db.chatConversation.updateMany.mockResolvedValue({ count: 1 });
    const service = new ChatService(prisma as any, audit);

    const result = await service.assumeConversation('pizzeria-1', 'conversation-1', 'user-a');

    expect(result.assignedToId).toBe('user-a');
    expect(prisma.db.chatConversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'conversation-1',
        pizzeriaId: 'pizzeria-1',
        version: 0,
        assignmentStatus: 'unassigned',
        assignedToId: null,
      }),
    }));
  });

  it('bloqueia a segunda assunção concorrente', async () => {
    const prisma = makePrisma();
    prisma.db.userPizzeriaRole.findUnique.mockResolvedValue({
      isActive: true,
      role: PizzeriaUserRole.atendente,
      user: { id: 'user-b', name: 'B', email: 'b@test', isActive: true },
    });
    prisma.db.chatConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      status: 'open',
      assignmentStatus: 'unassigned',
      assignedToId: null,
      version: 0,
    });
    prisma.db.chatConversation.updateMany.mockResolvedValue({ count: 0 });
    const service = new ChatService(prisma as any, audit);

    await expect(
      service.assumeConversation('pizzeria-1', 'conversation-1', 'user-b'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('permite transferência pelo responsável atual e bloqueia outro atendente', async () => {
    const prisma = makePrisma();
    prisma.db.userPizzeriaRole.findUnique.mockResolvedValue({
      isActive: true,
      role: PizzeriaUserRole.atendente,
      user: { id: 'user-b', name: 'B', email: 'b@test', isActive: true },
    });
    prisma.db.chatConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      status: 'open',
      assignedToId: 'user-a',
      version: 3,
    });
    const service = new ChatService(prisma as any, audit);

    await expect(
      service.assignConversation(
        'pizzeria-1',
        'conversation-1',
        { userId: 'user-b' },
        'user-c',
        PizzeriaUserRole.atendente,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.db.chatConversation.updateMany).not.toHaveBeenCalled();
  });

  it('impede atendente sem acesso ao tenant de ser alvo', async () => {
    const prisma = makePrisma();
    prisma.db.userPizzeriaRole.findUnique.mockResolvedValue(null);
    const service = new ChatService(prisma as any, audit);

    await expect(
      service.assumeConversation('pizzeria-1', 'conversation-1', 'user-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.chatConversation.findFirst).not.toHaveBeenCalled();
  });

  it('impede atendente de enviar após transferência para outro usuário', async () => {
    const prisma = makePrisma();
    prisma.db.chatConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      status: 'open',
      assignedToId: 'user-b',
    });
    const service = new ChatService(prisma as any, audit);

    await expect(
      service.sendMessage(
        'pizzeria-1',
        'conversation-1',
        { content: 'resposta' },
        'user-a',
        PizzeriaUserRole.atendente,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia encerramento por atendente que não é responsável', async () => {
    const prisma = makePrisma();
    prisma.db.chatConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      status: 'open',
      assignedToId: 'user-b',
      version: 2,
    });
    const service = new ChatService(prisma as any, audit);

    await expect(
      service.updateConversationStatus(
        'pizzeria-1',
        'conversation-1',
        { status: 'closed' },
        'user-a',
        PizzeriaUserRole.atendente,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite encerrar e reabrir pelo responsável', async () => {
    const prisma = makePrisma();
    prisma.db.chatConversation.findFirst
      .mockResolvedValueOnce({
        id: 'conversation-1',
        status: 'open',
        assignedToId: 'user-a',
        version: 4,
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        status: 'closed',
        assignedToId: 'user-a',
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        status: 'closed',
        assignedToId: 'user-a',
        version: 5,
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        status: 'open',
        assignedToId: 'user-a',
      });
    prisma.db.chatConversation.updateMany.mockResolvedValue({ count: 1 });
    const service = new ChatService(prisma as any, audit);

    const closed = await service.updateConversationStatus(
      'pizzeria-1',
      'conversation-1',
      { status: 'closed' },
      'user-a',
      PizzeriaUserRole.atendente,
    );
    const reopened = await service.updateConversationStatus(
      'pizzeria-1',
      'conversation-1',
      { status: 'open' },
      'user-a',
      PizzeriaUserRole.atendente,
    );

    expect(closed.status).toBe('closed');
    expect(reopened.status).toBe('open');
    expect(prisma.db.chatConversation.updateMany).toHaveBeenCalledTimes(2);
  });
});
