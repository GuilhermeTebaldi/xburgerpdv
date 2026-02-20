import { Prisma, SaleStatus, StockTargetType } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import type { FrontAppState } from '../types/frontend.js';
import type { RequestContext } from '../types/request-context.js';
import { HttpError } from '../utils/http-error.js';
import { AuditService } from './audit.service.js';
import {
  toFrontCleaningEntry,
  toFrontCleaningMaterial,
  toFrontIngredient,
  toFrontIngredientEntry,
  toFrontProduct,
  toFrontSale,
} from './mappers.service.js';
import { SessionService } from './session.service.js';

const EMPTY_APP_STATE: FrontAppState = {
  ingredients: [],
  products: [],
  sales: [],
  stockEntries: [],
  cleaningMaterials: [],
  cleaningStockEntries: [],
  globalSales: [],
  globalCancelledSales: [],
  globalStockEntries: [],
  globalCleaningStockEntries: [],
};

const arrayOrEmpty = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const normalizeStatePayload = (value: unknown): FrontAppState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Payload de estado inválido. Deve ser um objeto AppState.');
  }

  const payload = value as Record<string, unknown>;
  return {
    ingredients: arrayOrEmpty(payload.ingredients),
    products: arrayOrEmpty(payload.products),
    sales: arrayOrEmpty(payload.sales),
    stockEntries: arrayOrEmpty(payload.stockEntries),
    cleaningMaterials: arrayOrEmpty(payload.cleaningMaterials),
    cleaningStockEntries: arrayOrEmpty(payload.cleaningStockEntries),
    globalSales: arrayOrEmpty(payload.globalSales),
    globalCancelledSales: arrayOrEmpty(payload.globalCancelledSales),
    globalStockEntries: arrayOrEmpty(payload.globalStockEntries),
    globalCleaningStockEntries: arrayOrEmpty(payload.globalCleaningStockEntries),
  };
};

export class StateService {
  private readonly sessionService = new SessionService();

  async getAppState(): Promise<FrontAppState> {
    try {
      const snapshot = await prisma.appState.findUnique({ where: { id: 1 } });
      if (snapshot) {
        return normalizeStatePayload(snapshot.stateJson);
      }
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }
    }

    return this.buildStateFromDomain();
  }

  async saveAppState(state: unknown, context?: RequestContext): Promise<FrontAppState> {
    const normalized = normalizeStatePayload(state);
    await this.persistSnapshot(normalized, 'APP_STATE_UPSERTED', context);
    return normalized;
  }

  async clearAppState(context?: RequestContext): Promise<FrontAppState> {
    await this.persistSnapshot(EMPTY_APP_STATE, 'APP_STATE_CLEARED', context);
    return EMPTY_APP_STATE;
  }

  private isMissingAppStateTableError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
  }

  private async bootstrapAppStateTable(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_state (
        id integer PRIMARY KEY DEFAULT 1,
        state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT app_state_singleton CHECK (id = 1)
      )
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO app_state (id, state_json)
      VALUES (1, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `);
  }

  private async persistSnapshot(
    state: FrontAppState,
    action: 'APP_STATE_UPSERTED' | 'APP_STATE_CLEARED',
    context?: RequestContext
  ): Promise<void> {
    try {
      await this.upsertSnapshot(state, action, context);
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }

      await this.bootstrapAppStateTable();
      await this.upsertSnapshot(state, action, context);
    }
  }

  private async upsertSnapshot(
    state: FrontAppState,
    action: 'APP_STATE_UPSERTED' | 'APP_STATE_CLEARED',
    context?: RequestContext
  ): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.appState.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          stateJson: state as unknown as Prisma.InputJsonValue,
        },
        update: {
          stateJson: state as unknown as Prisma.InputJsonValue,
        },
      });

      await new AuditService(tx).log(
        {
          entityName: 'app_state',
          entityId: '1',
          action,
        },
        context
      );
    });
  }

  private async buildStateFromDomain(): Promise<FrontAppState> {
    const currentSession = await this.sessionService.getCurrentSession();

    const [
      ingredients,
      products,
      sessionSales,
      sessionStockMovements,
      cleaningMaterials,
      sessionCleaningMovements,
      globalSales,
      globalCancelledSales,
      globalStockMovements,
      globalCleaningMovements,
    ] = await Promise.all([
      prisma.ingredient.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.product.findMany({
        where: { isActive: true },
        include: { recipeItems: true },
        orderBy: { name: 'asc' },
      }),
      prisma.sale.findMany({
        where: {
          sessionId: currentSession.id,
          status: { not: SaleStatus.REFUNDED },
        },
        include: {
          items: {
            include: { ingredients: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.stockMovement.findMany({
        where: {
          sessionId: currentSession.id,
          isManual: true,
          targetType: StockTargetType.INGREDIENT,
        },
        include: {
          ingredient: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.cleaningMaterial.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.stockMovement.findMany({
        where: {
          sessionId: currentSession.id,
          isManual: true,
          targetType: StockTargetType.CLEANING_MATERIAL,
        },
        include: {
          cleaningMaterial: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sale.findMany({
        where: {
          status: { not: SaleStatus.REFUNDED },
        },
        include: {
          items: {
            include: { ingredients: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sale.findMany({
        where: {
          status: SaleStatus.REFUNDED,
        },
        include: {
          items: {
            include: { ingredients: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.stockMovement.findMany({
        where: {
          isManual: true,
          targetType: StockTargetType.INGREDIENT,
        },
        include: {
          ingredient: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.stockMovement.findMany({
        where: {
          isManual: true,
          targetType: StockTargetType.CLEANING_MATERIAL,
        },
        include: {
          cleaningMaterial: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      ingredients: ingredients.map(toFrontIngredient),
      products: products.map(toFrontProduct),
      sales: sessionSales.map(toFrontSale),
      stockEntries: sessionStockMovements.map(toFrontIngredientEntry),
      cleaningMaterials: cleaningMaterials.map(toFrontCleaningMaterial),
      cleaningStockEntries: sessionCleaningMovements.map(toFrontCleaningEntry),
      globalSales: globalSales.map(toFrontSale),
      globalCancelledSales: globalCancelledSales.map(toFrontSale),
      globalStockEntries: globalStockMovements.map(toFrontIngredientEntry),
      globalCleaningStockEntries: globalCleaningMovements.map(toFrontCleaningEntry),
    };
  }
}
