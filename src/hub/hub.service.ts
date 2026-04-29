import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface PizzeriaSummary {
  pizzeria_id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  summary: {
    open_orders: number;
    revenue_today: number;
    cash_open: boolean;
    stock_alerts: number;
  };
}

@Injectable()
export class HubService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: JwtPayload): Promise<PizzeriaSummary[]> {
    const pizzerias = await this.prisma.db.pizzeria.findMany({
      where: { ownerId: user.sub, status: { not: 'inactive' } },
      select: { id: true, tradeName: true, logoUrl: true, status: true },
    });

    const results = await Promise.all(
      pizzerias.map(async (p) => {
        const summary = await this.buildSummary(p.id);
        return {
          pizzeria_id: p.id,
          name: p.tradeName,
          logo_url: p.logoUrl,
          is_active: p.status === 'active',
          summary,
        };
      }),
    );

    return results;
  }

  private async buildSummary(pizzeriaId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [open_orders, revenue_today, cash_open, stock_alerts] =
      await Promise.all([
        this.countOpenOrders(pizzeriaId),
        this.calcRevenueToday(pizzeriaId, today),
        this.checkCashOpen(pizzeriaId, today),
        this.countStockAlerts(pizzeriaId),
      ]);

    return { open_orders, revenue_today, cash_open, stock_alerts };
  }

  private async countOpenOrders(pizzeriaId: string): Promise<number> {
    try {
      return await this.prisma.db.order.count({
        where: {
          pizzeriaId,
          status: { notIn: ['done', 'cancelled'] },
        },
      });
    } catch {
      return 0;
    }
  }

  private async calcRevenueToday(
    pizzeriaId: string,
    today: Date,
  ): Promise<number> {
    try {
      const result = await this.prisma.db.order.aggregate({
        where: {
          pizzeriaId,
          paymentStatus: 'paid',
          createdAt: { gte: today },
        },
        _sum: { total: true },
      });
      return Number(result._sum.total ?? 0);
    } catch {
      return 0;
    }
  }

  private async checkCashOpen(pizzeriaId: string, today: Date): Promise<boolean> {
    try {
      const session = await this.prisma.db.cashSession.findFirst({
        where: {
          pizzeriaId,
          closedAt: null,
          openedAt: { gte: today },
        },
        select: { id: true },
      });
      return session !== null;
    } catch {
      return false;
    }
  }

  private async countStockAlerts(pizzeriaId: string): Promise<number> {
    try {
      const result = await this.prisma.db.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count
        FROM stock_items
        WHERE pizzeria_id = ${pizzeriaId}
          AND quantity <= min_quantity
      `;
      return Number(result[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  async activate(pizzeriaId: string, user: JwtPayload) {
    const link = await this.prisma.db.userPizzeriaRole.findUnique({
      where: {
        userId_pizzeriaId: { userId: user.sub, pizzeriaId },
      },
      select: {
        isActive: true,
        role: true,
        pizzeria: { select: { tradeName: true, status: true } },
      },
    });

    if (!link?.isActive) {
      throw new ForbiddenException('Sem acesso a esta pizzaria');
    }

    if (link.pizzeria.status === 'inactive') {
      throw new ForbiddenException('Esta pizzaria está desativada');
    }

    return {
      pizzeria_id: pizzeriaId,
      pizzeria_name: link.pizzeria.tradeName,
      role: link.role,
    };
  }
}
