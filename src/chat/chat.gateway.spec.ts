import { PizzeriaUserRole } from '@prisma/client';
import { ChatGateway } from './chat.gateway';

describe('ChatGateway', () => {
  function makeGateway(role: PizzeriaUserRole | null = PizzeriaUserRole.atendente) {
    const client = {
      id: 'socket-1',
      data: { userId: 'user-1' },
      emit: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      handshake: { auth: {}, headers: {} },
    } as any;
    const prisma = {
      db: {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true }) },
        userPizzeriaRole: { findUnique: jest.fn().mockResolvedValue(role ? { isActive: true, role } : null) },
      },
    };
    const gateway = new ChatGateway(prisma as any, {} as any, {} as any);
    const emit = jest.fn();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;
    return { gateway, client, prisma, emit };
  }

  it('joins only an authorized tenant room', async () => {
    const { gateway, client, emit } = makeGateway();
    await gateway.handleJoinPizzeria({ pizzeriaId: 'pizzeria-1' }, client);
    expect(client.join).toHaveBeenCalledWith('chat:pizzeria:pizzeria-1');
    expect(client.emit).toHaveBeenCalledWith('joined', { room: 'chat:pizzeria:pizzeria-1' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a tenant where the user has no chat role', async () => {
    const { gateway, client } = makeGateway(null);
    await gateway.handleJoinPizzeria({ pizzeriaId: 'pizzeria-other' }, client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('chat:error', { message: 'Sem acesso ao chat desta pizzaria' });
  });

  it('emits realtime events only to the tenant room', () => {
    const { gateway, emit } = makeGateway();
    gateway.notifyMessageCreated('pizzeria-1', 'conversation-1', { id: 'message-1' });
    gateway.notifyConversationAssigned('pizzeria-1', 'conversation-1', { id: 'conversation-1' });
    expect((gateway.server.to as jest.Mock)).toHaveBeenCalledWith('chat:pizzeria:pizzeria-1');
    expect(emit).toHaveBeenNthCalledWith(1, 'message.created', expect.objectContaining({ pizzeriaId: 'pizzeria-1' }));
    expect(emit).toHaveBeenNthCalledWith(2, 'conversation.assigned', expect.objectContaining({ pizzeriaId: 'pizzeria-1' }));
  });

  it('disconnects clients without a token', async () => {
    const { gateway, client } = makeGateway();
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).toHaveBeenCalledWith('chat:error', { message: 'Token JWT obrigatório' });
  });
});
