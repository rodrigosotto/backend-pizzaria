import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SupabaseStorageService } from '../../infra/supabase/supabase-storage.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { randomUUID } from 'crypto';

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

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png'];
const MAX_AVATAR_SIZE_BYTES = 1024 * 1024;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: SupabaseStorageService,
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

  async uploadAvatar(
    id: string,
    file: Buffer,
    mimetype: string,
    requesterId: string,
    requesterRole: string,
  ) {
    if (!ALLOWED_AVATAR_TYPES.includes(mimetype)) {
      throw new BadRequestException(
        'Tipo de arquivo inválido. Permitidos: JPEG ou PNG',
      );
    }

    if (file.byteLength > MAX_AVATAR_SIZE_BYTES) {
      throw new BadRequestException('Imagem muito grande. O limite é 1 MB');
    }

    if (requesterId !== id && requesterRole !== 'owner' && requesterRole !== 'admin') {
      throw new ForbiddenException('Você só pode alterar o seu próprio avatar');
    }

    await this.findById(id);

    const ext = mimetype.split('/')[1].replace('jpeg', 'jpg');
    const path = `avatars/${id}/${randomUUID()}.${ext}`;

    const publicUrl = await this.storage.uploadFile('users', path, file, mimetype);

    const user = await this.prisma.db.user.update({
      where: { id },
      data: { avatarUrl: publicUrl },
      select: USER_SELECT,
    });

    await this.audit.log({
      action: 'USER_AVATAR_UPDATED',
      entity: 'User',
      entityId: id,
      userId: requesterId,
      after: { avatarUrl: publicUrl },
    });

    return user;
  }
}
