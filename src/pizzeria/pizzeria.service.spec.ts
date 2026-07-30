import { PizzeriaUserRole, UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { PizzeriaService } from './pizzeria.service';

const PIZZERIA_ID = 'c4c45fe0-df07-4e59-a33c-93dfd4d1fc5a';
const OWNER_ID = 'e9cc6d2f-e4b5-4063-b91a-3184147c3cee';
const DELIVERER_ID = '53dbcd68-6a43-444d-b7de-1bea4b846715';

describe('PizzeriaService — sincronização de entregadores', () => {
  const membership = {
    id: 'membership-id',
    role: PizzeriaUserRole.entregador,
    invitedAt: new Date(),
    acceptedAt: null,
    user: {
      id: DELIVERER_ID,
      name: 'Motoboy Um',
      email: 'motoboy1@pizzaria.test',
      phone: '11999999999',
      avatarUrl: null,
    },
  };

  function createSubject() {
    const userPizzeriaRole = {
      findUnique: jest.fn(),
      upsert: jest.fn(async () => membership),
      update: jest.fn(async () => membership),
    };
    const deliverer = {
      upsert: jest.fn(async () => ({ id: 'deliverer-id' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    };
    const user = {
      findUnique: jest.fn(async () => ({
        id: DELIVERER_ID,
        name: 'Motoboy Um',
        email: 'motoboy1@pizzaria.test',
        phone: '11999999999',
      })),
      update: jest.fn(async () => ({
        id: DELIVERER_ID,
        name: 'Motoboy Um',
        email: 'motoboy1@pizzaria.test',
        phone: '11999999999',
        cpf: '70000000108',
        street: 'Rua Demonstração',
        addressNumber: '101',
        neighborhood: 'Centro',
        zipCode: '01001000',
        city: 'São Paulo',
        state: 'SP',
        country: 'Brasil',
        avatarUrl: null,
      })),
    };
    const prisma = {
      db: {
        user,
        userPizzeriaRole,
        deliverer,
        $transaction: jest.fn(async (queries: Promise<unknown>[]) =>
          Promise.all(queries),
        ),
      },
    };
    const audit = { log: jest.fn(async () => undefined) };
    const service = new PizzeriaService(
      prisma as never,
      audit as never,
      {} as never,
    );

    return { service, prisma, userPizzeriaRole, deliverer };
  }

  const owner = {
    sub: OWNER_ID,
    email: 'proprietario@pizzaria.test',
    role: UserRole.owner,
  };

  it('cria o perfil operacional na mesma transação ao cadastrar role entregador', async () => {
    const { service, prisma, userPizzeriaRole, deliverer } = createSubject();
    userPizzeriaRole.findUnique
      .mockImplementationOnce(async () => ({ isActive: true, role: PizzeriaUserRole.admin }))
      .mockImplementationOnce(async () => null);

    await service.registerUser(
      PIZZERIA_ID,
      {
        name: 'Motoboy Um',
        email: 'motoboy1@pizzaria.test',
        phone: '11999999999',
        password: 'senha-segura',
        role: PizzeriaUserRole.entregador,
      },
      owner,
    );

    expect(prisma.db.$transaction).toHaveBeenCalledTimes(1);
    expect(deliverer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pizzeriaId_userId: {
            pizzeriaId: PIZZERIA_ID,
            userId: DELIVERER_ID,
          },
        },
      }),
    );
  });

  it('desativa o perfil operacional ao trocar para uma role não entregador', async () => {
    const { service, userPizzeriaRole, deliverer } = createSubject();
    userPizzeriaRole.findUnique
      .mockImplementationOnce(async () => ({ isActive: true, role: PizzeriaUserRole.admin }))
      .mockImplementationOnce(async () => ({
        id: 'membership-id',
        role: PizzeriaUserRole.entregador,
        isActive: true,
        user: { id: DELIVERER_ID, name: 'Motoboy Um', phone: '11999999999' },
      }));

    await service.updateUserRole(
      PIZZERIA_ID,
      DELIVERER_ID,
      { role: PizzeriaUserRole.atendente },
      owner,
    );

    expect(deliverer.updateMany).toHaveBeenCalledWith({
      where: {
        pizzeriaId: PIZZERIA_ID,
        userId: DELIVERER_ID,
        isActive: true,
      },
      data: { isActive: false },
    });
  });

  it('desativa o perfil operacional ao remover o usuário da pizzaria', async () => {
    const { service, userPizzeriaRole, deliverer } = createSubject();
    userPizzeriaRole.findUnique
      .mockImplementationOnce(async () => ({ isActive: true, role: PizzeriaUserRole.admin }))
      .mockImplementationOnce(async () => ({
        id: 'membership-id',
        role: PizzeriaUserRole.entregador,
        isActive: true,
      }));

    await service.removeUser(PIZZERIA_ID, DELIVERER_ID, owner);

    expect(deliverer.updateMany).toHaveBeenCalledWith({
      where: {
        pizzeriaId: PIZZERIA_ID,
        userId: DELIVERER_ID,
        isActive: true,
      },
      data: { isActive: false },
    });
  });

  it('não permite administrar a equipe usando apenas a role global', async () => {
    const { service, userPizzeriaRole } = createSubject();
    userPizzeriaRole.findUnique.mockResolvedValueOnce({
      isActive: true,
      role: PizzeriaUserRole.cozinha,
    });

    await expect(service.findUsers(PIZZERIA_ID, owner)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
