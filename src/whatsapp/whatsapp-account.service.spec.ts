import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WhatsAppAccountStatus } from '@prisma/client';
import { WhatsAppAccountService } from './whatsapp-account.service';

describe('WhatsAppAccountService', () => {
  function makePrisma(role: 'admin' | 'atendente' = 'admin', account: unknown = null) {
    const db = {
      userPizzeriaRole: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true, role }),
      },
      whatsAppAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'account-1', pizzeriaId: 'pizzeria-1', status: WhatsAppAccountStatus.pending }),
        update: jest.fn().mockResolvedValue({ id: 'account-1', pizzeriaId: 'pizzeria-1', status: WhatsAppAccountStatus.active }),
      },
    };
    return { db } as any;
  }

  const dto = {
    displayPhoneNumber: '+55 (45) 99904-8090',
    phoneNumberId: 'phone-number-1',
    businessAccountId: 'business-1',
    metaAppId: 'app-1',
  };

  it('allows an admin to create/update the account without returning secrets', async () => {
    const prisma = makePrisma();
    const service = new WhatsAppAccountService(prisma);
    await service.upsert('pizzeria-1', 'user-1', dto);
    expect(prisma.db.whatsAppAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { pizzeriaId: 'pizzeria-1' },
      create: expect.objectContaining({ displayPhoneNumber: '5545999048090', phoneNumberId: 'phone-number-1' }),
    }));
    expect(prisma.db.whatsAppAccount.upsert.mock.calls[0][0].select).not.toHaveProperty('accessToken');
    expect(prisma.db.whatsAppAccount.upsert.mock.calls[0][0].select).not.toHaveProperty('appSecret');
  });

  it('blocks non-admins', async () => {
    const prisma = makePrisma('atendente');
    const service = new WhatsAppAccountService(prisma);
    await expect(service.upsert('pizzeria-1', 'user-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a Phone Number ID already assigned to another tenant', async () => {
    const prisma = makePrisma();
    prisma.db.whatsAppAccount.findFirst.mockResolvedValue({ id: 'other-account' });
    const service = new WhatsAppAccountService(prisma);
    await expect(service.upsert('pizzeria-1', 'user-1', dto)).rejects.toThrow('outra unidade');
  });

  it('activates and deactivates only the account in the requested tenant', async () => {
    const prisma = makePrisma();
    const service = new WhatsAppAccountService(prisma);
    await service.setStatus('pizzeria-1', 'user-1', WhatsAppAccountStatus.active);
    expect(prisma.db.whatsAppAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { pizzeriaId: 'pizzeria-1' },
      data: { status: WhatsAppAccountStatus.active },
    }));
  });

  it('maps a missing account during status change to 404', async () => {
    const prisma = makePrisma();
    prisma.db.whatsAppAccount.update.mockRejectedValue({ code: 'P2025' });
    const service = new WhatsAppAccountService(prisma);
    await expect(service.setStatus('pizzeria-1', 'user-1', WhatsAppAccountStatus.inactive)).rejects.toBeInstanceOf(NotFoundException);
  });
});
