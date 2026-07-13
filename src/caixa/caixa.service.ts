import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

export type { JwtPayload } from '../modules/auth/auth.service';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CaixaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // SESSÕES DE CAIXA
  // =========================================================================

  /** RF63 — Abrir caixa com fundo de troco (RN03: só admin/caixa) */
  async openSession(pizzeriaId: string, dto: OpenCashSessionDto, userId: string) {
    const existing = await this.prisma.db.cashSession.findFirst({
      where: { pizzeriaId, closedAt: null },
      select: { id: true, openedAt: true },
    });
    if (existing) {
      throw new BadRequestException(
        `Já existe uma sessão de caixa aberta (aberta em ${existing.openedAt.toISOString()}).`,
      );
    }

    const session = await this.prisma.db.cashSession.create({
      data: {
        pizzeriaId,
        openedBy: userId,
        initialAmount: new Prisma.Decimal(dto.initialAmount),
      },
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'cash.open',
      entity: 'CashSession',
      entityId: session.id,
      after: { initialAmount: String(session.initialAmount) },
    });

    return session;
  }

  /** Sessão ativa atual da pizzaria */
  async getCurrentSession(pizzeriaId: string) {
    const session = await this.prisma.db.cashSession.findFirst({
      where: { pizzeriaId, closedAt: null },
      include: {
        opener: { select: { id: true, name: true } },
        withdrawals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!session) throw new NotFoundException('Nenhuma sessão de caixa aberta no momento');
    return session;
  }

  /** Buscar sessão por ID */
  async getSession(pizzeriaId: string, id: string) {
    const session = await this.prisma.db.cashSession.findFirst({
      where: { id, pizzeriaId },
      include: {
        opener: { select: { id: true, name: true } },
        closer: { select: { id: true, name: true } },
        withdrawals: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Sessão de caixa não encontrada');
    return session;
  }

  /** Histórico de sessões (paginado) */
  async listSessions(
    pizzeriaId: string,
    filters: { page?: number; limit?: number; onlyOpen?: boolean },
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.CashSessionWhereInput = { pizzeriaId };
    if (filters.onlyOpen) where.closedAt = null;

    const [sessions, total] = await this.prisma.db.$transaction([
      this.prisma.db.cashSession.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip,
        take: limit,
        include: {
          opener: { select: { id: true, name: true } },
          closer: { select: { id: true, name: true } },
          _count: { select: { withdrawals: true } },
        },
      }),
      this.prisma.db.cashSession.count({ where }),
    ]);

    return { sessions, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /**
   * RF67 — Fechar caixa com relatório consolidado.
   * RF69 — Conciliação: compara saldo esperado vs valor físico informado.
   * RF71 — Total de taxa de serviço no relatório.
   */
  async closeSession(
    pizzeriaId: string,
    id: string,
    dto: CloseCashSessionDto,
    userId: string,
  ) {
    const session = await this.prisma.db.cashSession.findFirst({
      where: { id, pizzeriaId },
      include: { withdrawals: true },
    });
    if (!session) throw new NotFoundException('Sessão de caixa não encontrada');
    if (session.closedAt) throw new BadRequestException('Esta sessão já foi fechada');

    // Agregar pedidos pagos desde a abertura do caixa, agrupados por forma de pagamento
    const groups = await this.prisma.db.order.groupBy({
      by: ['paymentMethod'],
      where: {
        pizzeriaId,
        paymentStatus: 'paid',
        createdAt: { gte: session.openedAt },
      },
      _sum: { total: true, serviceFee: true },
    });

    let totalCash = 0;
    let totalCredit = 0;
    let totalDebit = 0;
    let totalPix = 0;
    let totalVoucher = 0;
    let totalServiceFee = 0;

    for (const row of groups) {
      const amount = Number(row._sum.total ?? 0);
      totalServiceFee += Number(row._sum.serviceFee ?? 0);
      switch (row.paymentMethod) {
        case 'cash':    totalCash    = amount; break;
        case 'credit':  totalCredit  = amount; break;
        case 'debit':   totalDebit   = amount; break;
        case 'pix':     totalPix     = amount; break;
        case 'voucher': totalVoucher = amount; break;
      }
    }

    const totalWithdrawals = Number(session.totalWithdrawals);
    // Saldo esperado = fundo inicial + entradas em dinheiro − sangrias
    const expectedBalance = Number(session.initialAmount) + totalCash - totalWithdrawals;
    const difference = dto.actualBalance - expectedBalance;

    const updated = await this.prisma.db.cashSession.update({
      where: { id },
      data: {
        closedBy: userId,
        closedAt: new Date(),
        totalCash:       new Prisma.Decimal(totalCash),
        totalCredit:     new Prisma.Decimal(totalCredit),
        totalDebit:      new Prisma.Decimal(totalDebit),
        totalPix:        new Prisma.Decimal(totalPix),
        totalVoucher:    new Prisma.Decimal(totalVoucher),
        expectedBalance: new Prisma.Decimal(expectedBalance),
        actualBalance:   new Prisma.Decimal(dto.actualBalance),
        difference:      new Prisma.Decimal(difference),
      },
      include: {
        opener: { select: { id: true, name: true } },
        closer: { select: { id: true, name: true } },
        withdrawals: true,
      },
    });

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'cash.close',
      entity: 'CashSession',
      entityId: id,
      before: { closedAt: null },
      after: {
        closedAt: updated.closedAt?.toISOString(),
        difference: String(difference),
        totalCash: String(totalCash),
      },
    });

    return {
      ...updated,
      totalServiceFee: new Prisma.Decimal(totalServiceFee),
    };
  }

  // =========================================================================
  // SANGRIAS — RF66
  // =========================================================================

  /** RF66 — Registrar sangria na sessão ativa (RN03: só admin/caixa) */
  async createWithdrawal(
    pizzeriaId: string,
    cashSessionId: string,
    dto: CreateWithdrawalDto,
    userId: string,
  ) {
    const session = await this.prisma.db.cashSession.findFirst({
      where: { id: cashSessionId, pizzeriaId },
      select: { id: true, closedAt: true, totalWithdrawals: true },
    });
    if (!session) throw new NotFoundException('Sessão de caixa não encontrada');
    if (session.closedAt) throw new BadRequestException('Não é possível registrar sangria em sessão fechada');

    const amount = new Prisma.Decimal(dto.amount);

    const [withdrawal] = await this.prisma.db.$transaction([
      this.prisma.db.cashWithdrawal.create({
        data: { cashSessionId, amount, reason: dto.reason, createdBy: userId },
      }),
      this.prisma.db.cashSession.update({
        where: { id: cashSessionId },
        data: { totalWithdrawals: { increment: Number(amount) } },
      }),
    ]);

    await this.audit.log({
      userId,
      pizzeriaId,
      action: 'cash.withdrawal',
      entity: 'CashSession',
      entityId: cashSessionId,
      after: { amount: String(amount), reason: dto.reason },
    });

    return withdrawal;
  }

  /** Listar sangrias de uma sessão */
  async listWithdrawals(pizzeriaId: string, cashSessionId: string) {
    const session = await this.prisma.db.cashSession.findFirst({
      where: { id: cashSessionId, pizzeriaId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Sessão de caixa não encontrada');

    return this.prisma.db.cashWithdrawal.findMany({
      where: { cashSessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // =========================================================================
  // DASHBOARD — RF64, RF65, RF70, RF71
  // =========================================================================

  /**
   * RF64 — Total vendido: Hoje / 15 dias / 30 dias.
   * RF65 — Breakdown por forma de pagamento.
   * RF70 — Vendas por hora do dia.
   * RF71 — Total de taxa de serviço.
   */
  async getDashboard(pizzeriaId: string) {
    const now = new Date();

    const startToday  = new Date(now); startToday.setHours(0, 0, 0, 0);
    const start15d    = new Date(now); start15d.setDate(now.getDate() - 15);  start15d.setHours(0, 0, 0, 0);
    const start30d    = new Date(now); start30d.setDate(now.getDate() - 30);  start30d.setHours(0, 0, 0, 0);

    const [
      revenueToday,
      revenue15d,
      revenue30d,
      paymentBreakdown30d,
      serviceFeesToday,
      salesByHour,
      currentSession,
    ] = await Promise.all([
      // RF64 — receita hoje
      this.prisma.db.order.aggregate({
        where: { pizzeriaId, paymentStatus: 'paid', createdAt: { gte: startToday } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // RF64 — receita 15 dias
      this.prisma.db.order.aggregate({
        where: { pizzeriaId, paymentStatus: 'paid', createdAt: { gte: start15d } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // RF64 — receita 30 dias
      this.prisma.db.order.aggregate({
        where: { pizzeriaId, paymentStatus: 'paid', createdAt: { gte: start30d } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // RF65 — breakdown por forma de pagamento (últimos 30 dias)
      this.prisma.db.order.groupBy({
        by: ['paymentMethod'],
        where: { pizzeriaId, paymentStatus: 'paid', createdAt: { gte: start30d } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // RF71 — taxa de serviço hoje
      this.prisma.db.order.aggregate({
        where: { pizzeriaId, paymentStatus: 'paid', createdAt: { gte: startToday } },
        _sum: { serviceFee: true },
      }),
      // RF70 — vendas por hora do dia (últimos 30 dias, raw SQL)
      this.prisma.db.$queryRaw<Array<{ hour: number; total: string; orders: bigint }>>`
        SELECT
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
          SUM(total)::text AS total,
          COUNT(*) AS orders
        FROM orders
        WHERE pizzeria_id = ${pizzeriaId}
          AND payment_status = 'paid'
          AND created_at >= ${start30d}
        GROUP BY hour
        ORDER BY hour ASC
      `,
      // sessão atual (se aberta)
      this.prisma.db.cashSession.findFirst({
        where: { pizzeriaId, closedAt: null },
        select: {
          id: true,
          openedAt: true,
          initialAmount: true,
          totalWithdrawals: true,
          opener: { select: { id: true, name: true } },
          _count: { select: { withdrawals: true } },
        },
      }),
    ]);

    return {
      revenue: {
        today:   { total: Number(revenueToday._sum.total ?? 0), orders: revenueToday._count.id },
        last15d: { total: Number(revenue15d._sum.total   ?? 0), orders: revenue15d._count.id },
        last30d: { total: Number(revenue30d._sum.total   ?? 0), orders: revenue30d._count.id },
      },
      paymentBreakdown: paymentBreakdown30d.map((row) => ({
        method: row.paymentMethod,
        total:  Number(row._sum.total ?? 0),
        orders: row._count.id,
      })),
      serviceFeesToday: Number(serviceFeesToday._sum.serviceFee ?? 0),
      salesByHour: salesByHour.map((row) => ({
        hour:   row.hour,
        total:  Number(row.total),
        orders: Number(row.orders),
      })),
      currentSession,
    };
  }
}
