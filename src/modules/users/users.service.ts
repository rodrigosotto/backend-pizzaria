import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.db.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id },
      select: {
        ...USER_SELECT,
        pizzeriaRoles: {
          where: { isActive: true },
          select: {
            role: true,
            pizzeria: { select: { id: true, tradeName: true, status: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(id: string, dto: UpdateUserDto, requesterId: string) {
    await this.findById(id);

    const user = await this.prisma.db.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });

    await this.audit.log({
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      userId: requesterId,
    });

    return user;
  }

  async deactivate(id: string, requesterId: string) {
    await this.findById(id);

    const user = await this.prisma.db.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });

    await this.audit.log({
      action: 'USER_DEACTIVATED',
      entity: 'User',
      entityId: id,
      userId: requesterId,
    });

    return user;
  }
}
