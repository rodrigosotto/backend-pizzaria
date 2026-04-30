import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service';
import { ReportFiltersDto, ReportFiltersWithLimitDto } from './dto/report-filters.dto';

// Prisma 7 groupBy: _count result type includes a 'true' branch — use this helper to extract the value
function countOf(c: unknown): number {
  if (typeof c === 'object' && c !== null && '_all' in c) return Number((c as { _all: number })._all ?? 0);
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePeriod(filters: ReportFiltersDto): { from: Date; to: Date } {
  const now = new Date();

  const from = filters.dateFrom
    ? new Date(filters.dateFrom + 'T00:00:00.000Z')
    : new Date(now.getFullYear(), now.getMonth(), 1); // início do mês atual

  const to = filters.dateTo
    ? new Date(filters.dateTo + 'T23:59:59.999Z')
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // fim do mês atual

  return { from, to };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // SALES OVERVIEW — RF64/RF65 (extendido)
  // =========================================================================

  /**
   * Resumo financeiro de vendas do período:
   * receita total, ticket médio, totais por tipo de pedido, por forma de pagamento e por dia.
   */
  async getSalesReport(pizzeriaId: string, filters: ReportFiltersDto) {
    const { from, to } = parsePeriod(filters);

    const baseWhere = { pizzeriaId, paymentStatus: PaymentStatus.paid, createdAt: { gte: from, lte: to } };

    const [totals, byType, byPayment, byDay, cancellations] = await Promise.all([
      // Totais gerais
      this.prisma.db.order.aggregate({
        where: baseWhere,
        _sum:   { total: true, subtotal: true, discount: true, serviceFee: true, deliveryFee: true },
        _count: { id: true },
        _avg:   { total: true },
      }),

      // Por tipo de pedido (delivery / table / counter)
      this.prisma.db.order.groupBy({
        by: ['type'],
        where: baseWhere,
        _sum:   { total: true },
        _count: { _all: true },
        _avg:   { total: true },
      }),

      // Por forma de pagamento
      this.prisma.db.order.groupBy({
        by: ['paymentMethod'],
        where: baseWhere,
        _sum:   { total: true },
        _count: { _all: true },
      }),

      // Receita por dia (raw SQL para agrupamento por data)
      this.prisma.db.$queryRaw<Array<{ day: string; revenue: string; orders: bigint }>>`
        SELECT
          DATE(created_at AT TIME ZONE 'America/Sao_Paulo') AS day,
          SUM(total)::text                                   AS revenue,
          COUNT(*)                                           AS orders
        FROM orders
        WHERE pizzeria_id    = ${pizzeriaId}
          AND payment_status = 'paid'
          AND created_at     BETWEEN ${from} AND ${to}
        GROUP BY day
        ORDER BY day ASC
      `,

      // Pedidos cancelados no período
      this.prisma.db.order.count({
        where: { pizzeriaId, status: OrderStatus.cancelled, createdAt: { gte: from, lte: to } },
      }),
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        revenue:          Number(totals._sum?.total        ?? 0),
        subtotal:         Number(totals._sum?.subtotal     ?? 0),
        totalDiscount:    Number(totals._sum?.discount     ?? 0),
        totalServiceFee:  Number(totals._sum?.serviceFee   ?? 0),
        totalDeliveryFee: Number(totals._sum?.deliveryFee  ?? 0),
        orders:           totals._count?.id ?? 0,
        avgTicket:        Number(totals._avg?.total        ?? 0),
        cancellations,
      },
      byType: byType.map((r) => ({
        type:      r.type,
        revenue:   Number(r._sum?.total ?? 0),
        orders:    countOf(r._count),
        avgTicket: Number(r._avg?.total ?? 0),
      })),
      byPaymentMethod: byPayment.map((r) => ({
        method:  r.paymentMethod,
        revenue: Number(r._sum?.total ?? 0),
        orders:  countOf(r._count),
      })),
      byDay: byDay.map((r) => ({
        day:     r.day,
        revenue: Number(r.revenue),
        orders:  Number(r.orders),
      })),
    };
  }

  // =========================================================================
  // TOP PRODUCTS
  // =========================================================================

  /**
   * Produtos mais vendidos no período com quantidade e receita gerada.
   */
  async getTopProducts(pizzeriaId: string, filters: ReportFiltersWithLimitDto) {
    const { from, to } = parsePeriod(filters);
    const limit = filters.limit ?? 20;

    const rows = await this.prisma.db.$queryRaw<
      Array<{
        product_id: string;
        product_name: string;
        quantity: bigint;
        revenue: string;
        orders: bigint;
      }>
    >`
      SELECT
        p.id              AS product_id,
        p.name            AS product_name,
        SUM(oi.quantity)  AS quantity,
        SUM(oi.subtotal)::text AS revenue,
        COUNT(DISTINCT oi.order_id) AS orders
      FROM order_items oi
      JOIN products   p  ON p.id  = oi.product_id
      JOIN orders     o  ON o.id  = oi.order_id
      WHERE o.pizzeria_id    = ${pizzeriaId}
        AND o.payment_status = 'paid'
        AND o.created_at     BETWEEN ${from} AND ${to}
      GROUP BY p.id, p.name
      ORDER BY quantity DESC
      LIMIT ${limit}
    `;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      products: rows.map((r) => ({
        productId:   r.product_id,
        productName: r.product_name,
        quantity:    Number(r.quantity),
        revenue:     Number(r.revenue),
        orders:      Number(r.orders),
      })),
    };
  }

  // =========================================================================
  // STOCK CONSUMPTION — RF80
  // =========================================================================

  /**
   * RF80 — Relatório de consumo de estoque por período por ingrediente.
   * Agrega movimentos de saída (withdrawal, loss, auto_debit) por insumo.
   */
  async getStockConsumption(pizzeriaId: string, filters: ReportFiltersDto & { category?: string }) {
    const { from, to } = parsePeriod(filters);

    const categoryClause = filters.category
      ? Prisma.sql`AND si.category = ${filters.category}`
      : Prisma.empty;

    const rows = await this.prisma.db.$queryRaw<
      Array<{
        stock_item_id:   string;
        name:            string;
        unit:            string;
        category:        string;
        cost_per_unit:   string | null;
        total_withdrawn: string;
        total_loss:      string;
        total_auto:      string;
        total_consumed:  string;
        movement_count:  bigint;
      }>
    >(Prisma.sql`
      SELECT
        si.id              AS stock_item_id,
        si.name,
        si.unit,
        si.category,
        si.cost_per_unit::text,
        COALESCE(SUM(sm.quantity) FILTER (WHERE sm.type = 'withdrawal'),  0)::text AS total_withdrawn,
        COALESCE(SUM(sm.quantity) FILTER (WHERE sm.type = 'loss'),        0)::text AS total_loss,
        COALESCE(SUM(sm.quantity) FILTER (WHERE sm.type = 'auto_debit'),  0)::text AS total_auto,
        COALESCE(SUM(sm.quantity) FILTER (WHERE sm.type IN ('withdrawal','loss','auto_debit')), 0)::text AS total_consumed,
        COUNT(sm.id)       AS movement_count
      FROM stock_items si
      LEFT JOIN stock_movements sm
        ON sm.stock_item_id = si.id
        AND sm.type IN ('withdrawal', 'loss', 'auto_debit')
        AND sm.created_at BETWEEN ${from} AND ${to}
      WHERE si.pizzeria_id = ${pizzeriaId}
        ${categoryClause}
      GROUP BY si.id, si.name, si.unit, si.category, si.cost_per_unit
      HAVING COALESCE(SUM(sm.quantity) FILTER (WHERE sm.type IN ('withdrawal','loss','auto_debit')), 0) > 0
      ORDER BY total_consumed DESC
    `);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      consumption: rows.map((r) => {
        const consumed     = Number(r.total_consumed);
        const costPerUnit  = r.cost_per_unit ? Number(r.cost_per_unit) : null;
        return {
          stockItemId:   r.stock_item_id,
          name:          r.name,
          unit:          r.unit,
          category:      r.category,
          totalWithdrawn: Number(r.total_withdrawn),
          totalLoss:     Number(r.total_loss),
          totalAutoDebit: Number(r.total_auto),
          totalConsumed: consumed,
          estimatedCost: costPerUnit !== null ? Math.round(consumed * costPerUnit * 100) / 100 : null,
          movementCount: Number(r.movement_count),
        };
      }),
    };
  }

  // =========================================================================
  // STOCK CONSOLIDATION — RF81
  // =========================================================================

  /**
   * RF81 — Consolidação de insumos necessários baseada nos pedidos do período.
   *
   * Retorna três dimensões:
   * - productsSold: produtos vendidos no período
   * - expectedConsumption: insumos esperados baseados na ficha técnica (product_recipes)
   * - actualConsumption: insumos realmente consumidos (stock_movements)
   */
  async getStockConsolidation(pizzeriaId: string, filters: ReportFiltersDto) {
    const { from, to } = parsePeriod(filters);

    const [productsSold, expectedConsumption, actualConsumption] = await Promise.all([
      // Produtos vendidos: quantidade e receita
      this.prisma.db.$queryRaw<
        Array<{ product_id: string; product_name: string; quantity: bigint; revenue: string }>
      >`
        SELECT
          p.id                        AS product_id,
          p.name                      AS product_name,
          SUM(oi.quantity)            AS quantity,
          SUM(oi.subtotal)::text      AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN orders   o ON o.id = oi.order_id
        WHERE o.pizzeria_id    = ${pizzeriaId}
          AND o.payment_status = 'paid'
          AND o.created_at     BETWEEN ${from} AND ${to}
        GROUP BY p.id, p.name
        ORDER BY quantity DESC
      `,

      // Consumo esperado pela ficha técnica: soma(qtd_vendida × qtd_receita) por insumo
      this.prisma.db.$queryRaw<
        Array<{
          stock_item_id: string;
          name: string;
          unit: string;
          category: string;
          expected_quantity: string;
        }>
      >`
        SELECT
          si.id              AS stock_item_id,
          si.name,
          si.unit,
          si.category,
          SUM(oi.quantity * pr.quantity)::text AS expected_quantity
        FROM order_items oi
        JOIN orders           o  ON o.id  = oi.order_id
        JOIN product_recipes  pr ON pr.product_id = oi.product_id
        JOIN stock_items       si ON si.id = pr.stock_item_id
        WHERE o.pizzeria_id    = ${pizzeriaId}
          AND o.payment_status = 'paid'
          AND o.created_at     BETWEEN ${from} AND ${to}
        GROUP BY si.id, si.name, si.unit, si.category
        ORDER BY expected_quantity DESC
      `,

      // Insumos realmente consumidos (movimentos de saída no período)
      this.prisma.db.$queryRaw<
        Array<{ stock_item_id: string; name: string; unit: string; category: string; total_consumed: string }>
      >`
        SELECT
          si.id              AS stock_item_id,
          si.name,
          si.unit,
          si.category,
          SUM(sm.quantity)::text AS total_consumed
        FROM stock_movements sm
        JOIN stock_items si ON si.id = sm.stock_item_id
        WHERE si.pizzeria_id = ${pizzeriaId}
          AND sm.type IN ('withdrawal', 'loss', 'auto_debit')
          AND sm.created_at BETWEEN ${from} AND ${to}
        GROUP BY si.id, si.name, si.unit, si.category
        ORDER BY total_consumed DESC
      `,
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      productsSold: productsSold.map((r) => ({
        productId:   r.product_id,
        productName: r.product_name,
        quantity:    Number(r.quantity),
        revenue:     Number(r.revenue),
      })),
      expectedConsumption: expectedConsumption.map((r) => ({
        stockItemId:      r.stock_item_id,
        name:             r.name,
        unit:             r.unit,
        category:         r.category,
        expectedQuantity: Number(r.expected_quantity),
      })),
      actualConsumption: actualConsumption.map((r) => ({
        stockItemId:   r.stock_item_id,
        name:          r.name,
        unit:          r.unit,
        category:      r.category,
        totalConsumed: Number(r.total_consumed),
      })),
    };
  }

  // =========================================================================
  // COUPONS REPORT — RF94
  // =========================================================================

  /**
   * RF94 — Cupons utilizados no período com impacto no faturamento.
   */
  async getCouponsReport(pizzeriaId: string, filters: ReportFiltersDto) {
    const { from, to } = parsePeriod(filters);

    const [summary, byCoupon] = await Promise.all([
      // Totais gerais
      this.prisma.db.$queryRaw<
        Array<{ total_uses: bigint; total_discount: string; revenue_with_coupon: string; revenue_without_coupon: string }>
      >`
        SELECT
          COUNT(cu.id)                                                         AS total_uses,
          COALESCE(SUM(o.discount), 0)::text                                   AS total_discount,
          COALESCE(SUM(o.total) FILTER (WHERE o.coupon_id IS NOT NULL), 0)::text AS revenue_with_coupon,
          COALESCE(SUM(o.total) FILTER (WHERE o.coupon_id IS NULL),     0)::text AS revenue_without_coupon
        FROM orders o
        LEFT JOIN coupon_usages cu ON cu.order_id = o.id
        WHERE o.pizzeria_id    = ${pizzeriaId}
          AND o.payment_status = 'paid'
          AND o.created_at     BETWEEN ${from} AND ${to}
      `,

      // Por cupom
      this.prisma.db.$queryRaw<
        Array<{
          coupon_id:      string;
          code:           string;
          discount_type:  string;
          discount_value: string;
          usage_count:    bigint;
          total_discount: string;
          total_revenue:  string;
        }>
      >`
        SELECT
          c.id              AS coupon_id,
          c.code,
          c.discount_type,
          c.discount_value::text,
          COUNT(cu.id)      AS usage_count,
          SUM(o.discount)::text   AS total_discount,
          SUM(o.total)::text      AS total_revenue
        FROM coupons c
        JOIN coupon_usages cu ON cu.coupon_id = c.id
        JOIN orders       o  ON o.id = cu.order_id
        WHERE c.pizzeria_id    = ${pizzeriaId}
          AND o.payment_status = 'paid'
          AND cu.used_at       BETWEEN ${from} AND ${to}
        GROUP BY c.id, c.code, c.discount_type, c.discount_value
        ORDER BY usage_count DESC
      `,
    ]);

    const s = summary[0];

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        totalCouponsUsed:       Number(s?.total_uses             ?? 0),
        totalDiscountGiven:     Number(s?.total_discount         ?? 0),
        revenueWithCoupon:      Number(s?.revenue_with_coupon    ?? 0),
        revenueWithoutCoupon:   Number(s?.revenue_without_coupon ?? 0),
      },
      byCoupon: byCoupon.map((r) => ({
        couponId:      r.coupon_id,
        code:          r.code,
        discountType:  r.discount_type,
        discountValue: Number(r.discount_value),
        usageCount:    Number(r.usage_count),
        totalDiscount: Number(r.total_discount),
        totalRevenue:  Number(r.total_revenue),
      })),
    };
  }

  // =========================================================================
  // CASH SESSIONS HISTORY
  // =========================================================================

  /**
   * Histórico consolidado de sessões de caixa do período com totais agregados.
   */
  async getCashReport(pizzeriaId: string, filters: ReportFiltersDto) {
    const { from, to } = parsePeriod(filters);

    const sessions = await this.prisma.db.cashSession.findMany({
      where: {
        pizzeriaId,
        openedAt: { gte: from, lte: to },
      },
      orderBy: { openedAt: 'desc' },
      include: {
        opener: { select: { id: true, name: true } },
        closer: { select: { id: true, name: true } },
        _count: { select: { withdrawals: true } },
      },
    });

    // Agregar totais das sessões fechadas
    const closed = sessions.filter((s) => s.closedAt !== null);
    const totals = closed.reduce(
      (acc, s) => ({
        totalCash:         acc.totalCash         + Number(s.totalCash         ?? 0),
        totalCredit:       acc.totalCredit       + Number(s.totalCredit       ?? 0),
        totalDebit:        acc.totalDebit        + Number(s.totalDebit        ?? 0),
        totalPix:          acc.totalPix          + Number(s.totalPix          ?? 0),
        totalVoucher:      acc.totalVoucher      + Number(s.totalVoucher      ?? 0),
        totalWithdrawals:  acc.totalWithdrawals  + Number(s.totalWithdrawals  ?? 0),
        totalDifference:   acc.totalDifference   + Number(s.difference        ?? 0),
        grossRevenue:      acc.grossRevenue      + Number(s.totalCash ?? 0) + Number(s.totalCredit ?? 0) +
                           Number(s.totalDebit ?? 0) + Number(s.totalPix ?? 0) + Number(s.totalVoucher ?? 0),
      }),
      { totalCash: 0, totalCredit: 0, totalDebit: 0, totalPix: 0, totalVoucher: 0,
        totalWithdrawals: 0, totalDifference: 0, grossRevenue: 0 },
    );

    return {
      period:    { from: from.toISOString(), to: to.toISOString() },
      sessions,
      totals,
      sessionCount: sessions.length,
      closedCount:  closed.length,
      openCount:    sessions.filter((s) => !s.closedAt).length,
    };
  }
}
