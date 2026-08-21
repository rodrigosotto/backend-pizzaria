import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';

describe('Chat security tenant isolation', () => {
  it('does not allow an internal automatic message for a customer from another tenant', async () => {
    const prisma = {
      db: {
        customer: { findFirst: jest.fn().mockResolvedValue(null) },
        chatConversation: { upsert: jest.fn() },
      },
    };
    const service = new ChatService(prisma as any, { log: jest.fn() } as any);
    await expect(
      service.sendAutoMessage('tenant-a', 'customer-from-tenant-b', 'conteúdo'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.chatConversation.upsert).not.toHaveBeenCalled();
  });

  it('does not return a conversation outside the selected tenant', async () => {
    const prisma = {
      db: {
        chatConversation: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    };
    const service = new ChatService(prisma as any, { log: jest.fn() } as any);
    await expect(
      service.getConversation('tenant-b', 'conversation-from-tenant-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.db.chatConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conversation-from-tenant-a', pizzeriaId: 'tenant-b' },
      }),
    );
  });
});
