import {
  SaleStatus,
  StockDirection,
  StockTargetType,
  type Prisma,
  type StockMovement,
} from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { roundMoney, roundQuantity, toNumber } from '../utils/decimal.js';
import { HttpError } from '../utils/http-error.js';
import { SessionService } from './session.service.js';

interface ReportFilters {
  scope: 'current' | 'all' | 'session';
  sessionId?: string;
  from?: Date;
  to?: Date;
}

const sumMoney = (values: number[]) => roundMoney(values.reduce((acc, value) => roundMoney(acc + value), 0));
const sumQty = (values: number[]) => roundQuantity(values.reduce((acc, value) => roundQuantity(acc + value), 0));

const getMovementSignedCost = (movement: StockMovement) => {
  const value = toNumber(movement.totalCost);
  return movement.direction === StockDirection.OUT ? value : -value;
};

export class ReportService {
  private readonly sessionService = new SessionService();

  private async resolveSessionScope(filters: ReportFilters): Promise<string | undefined> {
    if (filters.scope === 'all') return undefined;
    if (filters.scope === 'session') {
      if (!filters.sessionId) {
        throw new HttpError(422, 'sessionId é obrigatório quando scope=session');
      }
      return filters.sessionId;
    }

    const current = await this.sessionService.getCurrentSession();
    return current.id;
  }

  private buildDateFilter(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    return {
      gte: from,
      lte: to,
    };
  }

  async overview(filters: ReportFilters) {
    const sessionId = await this.resolveSessionScope(filters);
    const dateFilter = this.buildDateFilter(filters.from, filters.to);

    const sales = await prisma.sale.findMany({
      where: {
        sessionId,
        createdAt: dateFilter,
      },
      include: {
        refunds: true,
      },
    });

    const manualMovements = await prisma.stockMovement.findMany({
      where: {
        sessionId,
        createdAt: dateFilter,
        isManual: true,
      },
    });

    const manualIngredientMovements = manualMovements.filter(
      (movement) => movement.targetType === StockTargetType.INGREDIENT
    );
    const manualCleaningMovements = manualMovements.filter(
      (movement) => movement.targetType === StockTargetType.CLEANING_MATERIAL
    );

    const totalGrossRevenue = sumMoney(sales.map((sale) => toNumber(sale.totalGross)));
    const totalNetRevenue = sumMoney(sales.map((sale) => toNumber(sale.totalNet)));
    const totalRefunds = sumMoney(sales.map((sale) => toNumber(sale.totalRefunded)));

    const grossSalesCost = sumQty(sales.map((sale) => toNumber(sale.totalCost)));

    const refundedCost = sumQty(
      sales.flatMap((sale) => sale.refunds.map((refund) => toNumber(refund.totalCostReversed)))
    );

    const netSalesCost = roundQuantity(grossSalesCost - refundedCost);

    const manualIngredientOutCost = sumQty(
      manualIngredientMovements
        .filter((movement) => movement.direction === StockDirection.OUT)
        .map((movement) => toNumber(movement.totalCost))
    );

    const manualCleaningOutCost = sumQty(
      manualCleaningMovements
        .filter((movement) => movement.direction === StockDirection.OUT)
        .map((movement) => toNumber(movement.totalCost))
    );

    const totalManualOutCost = roundQuantity(manualIngredientOutCost + manualCleaningOutCost);
    const totalCost = roundQuantity(netSalesCost + totalManualOutCost);
    const netProfit = roundMoney(totalNetRevenue - totalCost);

    const activeSalesCount = sales.filter((sale) => sale.status !== SaleStatus.REFUNDED).length;
    const refundedSalesCount = sales.filter((sale) => sale.status === SaleStatus.REFUNDED).length;
    const partialRefundedSalesCount = sales.filter(
      (sale) => sale.status === SaleStatus.PARTIALLY_REFUNDED
    ).length;

    return {
      scope: filters.scope,
      sessionId: sessionId || null,
      period: {
        from: filters.from || null,
        to: filters.to || null,
      },
      metrics: {
        faturamentoBruto: totalGrossRevenue,
        vendasLiquidas: totalNetRevenue,
        estornos: totalRefunds,
        custoInsumosVendasBruto: grossSalesCost,
        custoInsumosEstornado: refundedCost,
        custoInsumosVendasLiquido: netSalesCost,
        custoBaixaManualIngredientes: manualIngredientOutCost,
        custoBaixaManualMateriais: manualCleaningOutCost,
        custoTotal: totalCost,
        lucroLiquido: netProfit,
      },
      counters: {
        vendasAtivasOuParciais: activeSalesCount,
        vendasTotalmenteEstornadas: refundedSalesCount,
        vendasComEstornoParcial: partialRefundedSalesCount,
        movimentacoesManuais: manualMovements.length,
      },
      diagnostics: {
        saldoMovimentacoesManuais: sumQty(manualMovements.map(getMovementSignedCost)),
      },
    };
  }
}
