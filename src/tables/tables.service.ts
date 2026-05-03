import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { OpenSessionDto } from './dto/open-session.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { randomBytes } from 'crypto';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function generateQrToken(): string {
  return randomBytes(16).toString('hex');
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // TABLES
  // =========================================================================

  async listTables(pizzeriaId: string, status?: string) {
    return this.prisma.db.table.findMany({
      where: {
        pizzeriaId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        sessions: {
          where: { closedAt: null },
          take: 1,
          orderBy: { openedAt: 'desc' },
        },
      },
      orderBy: { number: 'asc' },
    });
  }

  async findTableById(pizzeriaId: string, id: string) {
    const table = await this.prisma.db.table.findFirst({
      where: { id, pizzeriaId },
      include: {
        sessions: {
          where: { closedAt: null },
          take: 1,
          orderBy: { openedAt: 'desc' },
          include: {
            orders: {
              where: { status: { not: 'cancelled' } },
              select: { id: true, status: true, total: true, createdAt: true },
            },
          },
        },
      },
    });

    if (!table) throw new NotFoundException('Mesa não encontrada');
    return table;
  }

  async createTable(pizzeriaId: string, dto: CreateTableDto, userId: string) {
    const existing = await this.prisma.db.table.findUnique({
      where: { pizzeriaId_number: { pizzeriaId, number: dto.number } },
    });

    if (existing) {
      throw new ConflictException(`Já existe uma mesa com o número ${dto.number}`);
    }

    const token = dto.qrCodeToken ?? generateQrToken();

    const tokenTaken = await this.prisma.db.table.findUnique({
      where: { qrCodeToken: token },
    });
    if (tokenTaken) {
      throw new ConflictException('QR Code token já em uso');
    }

    const table = await this.prisma.db.table.create({
      data: {
        pizzeriaId,
        number: dto.number,
        capacity: dto.capacity,
        qrCodeToken: token,
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'Table',
      entityId: table.id,
      after: { number: table.number, capacity: table.capacity },
    });

    return table;
  }

  async updateTable(
    pizzeriaId: string,
    id: string,
    dto: UpdateTableDto,
    userId: string,
  ) {
    await this.findTableById(pizzeriaId, id);

    if (dto.number !== undefined) {
      const conflict = await this.prisma.db.table.findUnique({
        where: { pizzeriaId_number: { pizzeriaId, number: dto.number } },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Já existe uma mesa com o número ${dto.number}`);
      }
    }

    const updated = await this.prisma.db.table.update({
      where: { id },
      data: {
        ...(dto.number !== undefined && { number: dto.number }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'Table',
      entityId: id,
      after: dto as Record<string, unknown>,
    });

    return updated;
  }

  async removeTable(pizzeriaId: string, id: string, userId: string) {
    const table = await this.findTableById(pizzeriaId, id);

    if (table.status !== 'free') {
      throw new BadRequestException(
        'Só é possível remover mesas com status "free" (livre)',
      );
    }

    const activeSession = table.sessions[0] ?? null;
    if (activeSession) {
      throw new BadRequestException('Mesa possui sessão ativa. Feche a sessão antes de remover.');
    }

    await this.prisma.db.table.delete({ where: { id } });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'DELETE',
      entity: 'Table',
      entityId: id,
      before: { number: table.number },
    });
  }

  // =========================================================================
  // TABLE SESSIONS
  // =========================================================================

  async openSession(
    pizzeriaId: string,
    tableId: string,
    dto: OpenSessionDto,
    userId: string,
  ) {
    const table = await this.prisma.db.table.findFirst({
      where: { id: tableId, pizzeriaId },
    });

    if (!table) throw new NotFoundException('Mesa não encontrada');

    if (table.status === 'occupied') {
      throw new BadRequestException('Mesa já está ocupada. Feche a sessão atual antes de abrir uma nova.');
    }

    // Atomicamente: cria sessão + atualiza status da mesa
    const [session] = await this.prisma.db.$transaction([
      this.prisma.db.tableSession.create({
        data: {
          tableId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerCpf: dto.customerCpf,
        },
      }),
      this.prisma.db.table.update({
        where: { id: tableId },
        data: { status: 'occupied' },
      }),
    ]);

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'TableSession',
      entityId: session.id,
      after: { tableId, customerName: dto.customerName },
    });

    return session;
  }

  async getCurrentSession(pizzeriaId: string, tableId: string) {
    const table = await this.prisma.db.table.findFirst({
      where: { id: tableId, pizzeriaId },
    });

    if (!table) throw new NotFoundException('Mesa não encontrada');

    const session = await this.prisma.db.tableSession.findFirst({
      where: { tableId, closedAt: null },
      orderBy: { openedAt: 'desc' },
      include: {
        orders: {
          where: { status: { not: 'cancelled' } },
          select: {
            id: true,
            status: true,
            total: true,
            subtotal: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Nenhuma sessão ativa nesta mesa');
    return session;
  }

  async closeSession(
    pizzeriaId: string,
    tableId: string,
    sessionId: string,
    userId: string,
  ) {
    const table = await this.prisma.db.table.findFirst({
      where: { id: tableId, pizzeriaId },
    });

    if (!table) throw new NotFoundException('Mesa não encontrada');

    const session = await this.prisma.db.tableSession.findFirst({
      where: { id: sessionId, tableId, closedAt: null },
    });

    if (!session) {
      throw new NotFoundException('Sessão ativa não encontrada para esta mesa');
    }

    // Atomicamente: fecha sessão + libera mesa
    const [closedSession] = await this.prisma.db.$transaction([
      this.prisma.db.tableSession.update({
        where: { id: sessionId },
        data: { closedAt: new Date() },
      }),
      this.prisma.db.table.update({
        where: { id: tableId },
        data: { status: 'free' },
      }),
    ]);

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'UPDATE',
      entity: 'TableSession',
      entityId: sessionId,
      after: { closedAt: closedSession.closedAt },
    });

    return closedSession;
  }

  // =========================================================================
  // TABLE RESERVATIONS
  // =========================================================================

  async listReservations(
    pizzeriaId: string,
    tableId?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    return this.prisma.db.tableReservation.findMany({
      where: {
        table: { pizzeriaId },
        ...(tableId ? { tableId } : {}),
        ...(dateFrom || dateTo
          ? {
              reservedAt: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo) } : {}),
              },
            }
          : {}),
      },
      include: {
        table: { select: { number: true, capacity: true } },
      },
      orderBy: { reservedAt: 'asc' },
    });
  }

  async createReservation(
    pizzeriaId: string,
    dto: CreateReservationDto,
    userId: string,
  ) {
    const table = await this.prisma.db.table.findFirst({
      where: { id: dto.tableId, pizzeriaId },
    });

    if (!table) throw new NotFoundException('Mesa não encontrada');

    if (table.status === 'occupied') {
      throw new BadRequestException('Mesa está ocupada e não pode ser reservada');
    }

    const reservation = await this.prisma.db.tableReservation.create({
      data: {
        tableId: dto.tableId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        reservedAt: new Date(dto.reservedAt),
        notes: dto.notes,
      },
      include: {
        table: { select: { number: true, capacity: true } },
      },
    });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'CREATE',
      entity: 'TableReservation',
      entityId: reservation.id,
      after: { tableId: dto.tableId, customerName: dto.customerName, reservedAt: dto.reservedAt },
    });

    return reservation;
  }

  async cancelReservation(pizzeriaId: string, id: string, userId: string) {
    const reservation = await this.prisma.db.tableReservation.findFirst({
      where: { id, table: { pizzeriaId } },
      include: { table: { select: { number: true } } },
    });

    if (!reservation) throw new NotFoundException('Reserva não encontrada');

    await this.prisma.db.tableReservation.delete({ where: { id } });

    this.audit.log({
      pizzeriaId,
      userId,
      action: 'DELETE',
      entity: 'TableReservation',
      entityId: id,
      before: { customerName: reservation.customerName, tableNumber: reservation.table.number },
    });
  }
}
