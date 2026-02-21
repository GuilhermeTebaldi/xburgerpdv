import { Prisma, SaleStatus, StockTargetType } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import type { FrontAppState } from '../types/frontend.js';
import type { RequestContext } from '../types/request-context.js';
import { HttpError } from '../utils/http-error.js';
import type { StateCommandInput } from '../validators/state-command.validator.js';
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
import { applyStateCommand } from './state-command.service.js';

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

const toVersionTag = (value: Date): string => value.toISOString();

export interface AppStateSnapshot {
  state: FrontAppState;
  version: string;
}

export class StateService {
  private readonly sessionService = new SessionService();

  async getAppState(): Promise<AppStateSnapshot> {
    try {
      const snapshot = await prisma.appState.findUnique({ where: { id: 1 } });
      if (snapshot) {
        return {
          state: normalizeStatePayload(snapshot.stateJson),
          version: toVersionTag(snapshot.updatedAt),
        };
      }
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }
      await this.bootstrapAppStateTable();
    }

    const rebuilt = await this.buildStateFromDomain();
    return this.persistSnapshot(rebuilt, 'APP_STATE_BOOTSTRAPPED');
  }

  async saveAppState(
    state: unknown,
    expectedVersion: string,
    context?: RequestContext
  ): Promise<AppStateSnapshot> {
    const normalized = normalizeStatePayload(state);
    return this.persistSnapshot(normalized, 'APP_STATE_UPSERTED', context, expectedVersion);
  }

  async clearAppState(expectedVersion: string, context?: RequestContext): Promise<AppStateSnapshot> {
    return this.persistSnapshot(EMPTY_APP_STATE, 'APP_STATE_CLEARED', context, expectedVersion);
  }

  async applyCommand(
    command: StateCommandInput,
    expectedVersion: string,
    context?: RequestContext
  ): Promise<AppStateSnapshot> {
    try {
      return await this.applyCommandSnapshot(command, expectedVersion, context);
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }

      await this.bootstrapAppStateTable();
      return this.applyCommandSnapshot(command, expectedVersion, context);
    }
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
    action: 'APP_STATE_BOOTSTRAPPED' | 'APP_STATE_UPSERTED' | 'APP_STATE_CLEARED',
    context?: RequestContext,
    expectedVersion?: string
  ): Promise<AppStateSnapshot> {
    try {
      return await this.upsertSnapshot(state, action, context, expectedVersion);
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }

      await this.bootstrapAppStateTable();
      return this.upsertSnapshot(state, action, context, expectedVersion);
    }
  }

  private async upsertSnapshot(
    state: FrontAppState,
    action: 'APP_STATE_BOOTSTRAPPED' | 'APP_STATE_UPSERTED' | 'APP_STATE_CLEARED',
    context?: RequestContext,
    expectedVersion?: string
  ): Promise<AppStateSnapshot> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.appState.findUnique({ where: { id: 1 } });
      const currentVersion = current ? toVersionTag(current.updatedAt) : null;

      if (expectedVersion !== undefined) {
        if (!currentVersion) {
          throw new HttpError(412, 'Versão de estado inválida. Snapshot base não encontrado.', {
            expectedVersion,
            currentVersion: null,
          });
        }
        if (expectedVersion !== currentVersion) {
          throw new HttpError(412, 'Conflito de versão no estado. Recarregue antes de salvar.', {
            expectedVersion,
            currentVersion,
          });
        }
      }

      const saved = current
        ? await tx.appState.update({
            where: { id: 1 },
            data: {
              stateJson: state as unknown as Prisma.InputJsonValue,
            },
          })
        : await tx.appState.create({
            data: {
              id: 1,
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

      return {
        state,
        version: toVersionTag(saved.updatedAt),
      };
    });
  }

  private assertExpectedVersion(
    expectedVersion: string | undefined,
    currentVersion: string | null
  ): void {
    if (expectedVersion === undefined) return;

    if (!currentVersion) {
      throw new HttpError(412, 'Versão de estado inválida. Snapshot base não encontrado.', {
        expectedVersion,
        currentVersion: null,
      });
    }

    if (expectedVersion !== currentVersion) {
      throw new HttpError(412, 'Conflito de versão no estado. Recarregue antes de salvar.', {
        expectedVersion,
        currentVersion,
      });
    }
  }

  private async applyCommandSnapshot(
    command: StateCommandInput,
    expectedVersion: string,
    context?: RequestContext
  ): Promise<AppStateSnapshot> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.appState.findUnique({ where: { id: 1 } });
      const currentVersion = current ? toVersionTag(current.updatedAt) : null;
      this.assertExpectedVersion(expectedVersion, currentVersion);

      const currentState = current ? normalizeStatePayload(current.stateJson) : EMPTY_APP_STATE;
      const nextState = applyStateCommand(currentState, command);

      const saved = current
        ? await tx.appState.update({
            where: { id: 1 },
            data: {
              stateJson: nextState as unknown as Prisma.InputJsonValue,
            },
          })
        : await tx.appState.create({
            data: {
              id: 1,
              stateJson: nextState as unknown as Prisma.InputJsonValue,
            },
          });

      await new AuditService(tx).log(
        {
          entityName: 'app_state',
          entityId: '1',
          action: 'APP_STATE_COMMAND_APPLIED',
          metadata: {
            commandType: command.type,
            commandId: command.commandId ?? null,
          },
        },
        context
      );

      return {
        state: nextState,
        version: toVersionTag(saved.updatedAt),
      };
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
          refunds: {
            select: {
              totalCostReversed: true,
            },
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
          refunds: {
            select: {
              totalCostReversed: true,
            },
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
          refunds: {
            select: {
              totalCostReversed: true,
            },
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
