import { AppStateBackupKind, Prisma, SaleStatus, StockTargetType } from '@prisma/client';

import { env } from '../config/env.js';
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
import { addDays, toBackupDay, toDateOnlyKey } from './state-backup.utils.js';
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
  saleDrafts: [],
  cashRegisterAmount: 0,
  dailySalesHistory: [],
};

const arrayOrEmpty = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const toNonNegativeNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

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
    saleDrafts: arrayOrEmpty(payload.saleDrafts),
    cashRegisterAmount: toNonNegativeNumber(payload.cashRegisterAmount),
    dailySalesHistory: arrayOrEmpty(payload.dailySalesHistory),
  };
};

const normalizeStatePayloadSafe = (value: unknown): FrontAppState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
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
      saleDrafts: [],
      cashRegisterAmount: 0,
      dailySalesHistory: [],
    };
  }
  return normalizeStatePayload(value);
};

const toVersionTag = (value: Date): string => value.toISOString();

export interface AppStateSnapshot {
  state: FrontAppState;
  version: string;
}

export interface DailyBackupResult {
  backupDay: string;
  created: boolean;
  sourceVersion: string;
  prunedCount: number;
}

export class StateService {
  private readonly sessionService = new SessionService();

  async getAppState(): Promise<AppStateSnapshot> {
    try {
      const snapshot = await prisma.appState.findUnique({ where: { id: 1 } });
      if (snapshot) {
        return {
          state: normalizeStatePayloadSafe(snapshot.stateJson),
          version: toVersionTag(snapshot.updatedAt),
        };
      }
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }
      await this.bootstrapAppStateTables();
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

      await this.bootstrapAppStateTables();
      return this.applyCommandSnapshot(command, expectedVersion, context);
    }
  }

  async runDailyBackup(context?: RequestContext): Promise<DailyBackupResult> {
    const now = new Date();
    try {
      return await this.createDailyBackup(now, context);
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }

      await this.bootstrapAppStateTables();
      return this.createDailyBackup(now, context);
    }
  }

  private isMissingAppStateTableError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
  }

  private async bootstrapAppStateTables(): Promise<void> {
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

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        CREATE TYPE app_state_backup_kind AS ENUM ('PRE_WRITE', 'DAILY', 'MANUAL');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_state_backups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind app_state_backup_kind NOT NULL,
        source_version varchar(80) NOT NULL,
        backup_day date,
        state_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS app_state_backups_backup_day_kind_key
      ON app_state_backups (backup_day, kind)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS app_state_backups_kind_created_at_idx
      ON app_state_backups (kind, created_at)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS app_state_backups_source_version_idx
      ON app_state_backups (source_version)
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

      await this.bootstrapAppStateTables();
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
      const operationNow = new Date();

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

      await this.ensurePreWriteBackupTx(tx, current);

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

      await this.ensureDailyBackupTx(
        tx,
        saved.stateJson as Prisma.JsonValue,
        toVersionTag(saved.updatedAt),
        operationNow
      );
      await this.pruneExpiredBackupsTx(tx, operationNow);

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
      const operationNow = new Date();
      this.assertExpectedVersion(expectedVersion, currentVersion);

      const currentState = current ? normalizeStatePayloadSafe(current.stateJson) : EMPTY_APP_STATE;
      await this.ensurePreWriteBackupTx(tx, current);
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

      await this.ensureDailyBackupTx(
        tx,
        saved.stateJson as Prisma.JsonValue,
        toVersionTag(saved.updatedAt),
        operationNow
      );
      await this.pruneExpiredBackupsTx(tx, operationNow);

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

  private async createDailyBackup(
    referenceDate: Date,
    context?: RequestContext
  ): Promise<DailyBackupResult> {
    const snapshot = await this.getAppState();
    const backupDay = toBackupDay(referenceDate, env.DEFAULT_TIMEZONE);
    const backupDayKey = toDateOnlyKey(backupDay);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const liveState = await tx.appState.findUnique({ where: { id: 1 } });
      const sourceVersion = liveState ? toVersionTag(liveState.updatedAt) : snapshot.version;
      const stateJson = (liveState?.stateJson ?? snapshot.state) as Prisma.JsonValue;

      const created = await this.ensureDailyBackupTx(tx, stateJson, sourceVersion, referenceDate);
      const prunedCount = await this.pruneExpiredBackupsTx(tx, referenceDate);

      await new AuditService(tx).log(
        {
          entityName: 'app_state',
          entityId: '1',
          action: 'APP_STATE_BACKUP_DAILY',
          metadata: {
            backupDay: backupDayKey,
            created,
            sourceVersion,
            prunedCount,
          },
        },
        context
      );

      return {
        backupDay: backupDayKey,
        created,
        sourceVersion,
        prunedCount,
      };
    });
  }

  private async ensurePreWriteBackupTx(
    tx: Prisma.TransactionClient,
    current: { stateJson: Prisma.JsonValue; updatedAt: Date } | null
  ): Promise<void> {
    if (!current) return;

    const sourceVersion = toVersionTag(current.updatedAt);
    const existing = await tx.appStateBackup.findFirst({
      where: {
        kind: AppStateBackupKind.PRE_WRITE,
        sourceVersion,
      },
      select: { id: true },
    });

    if (existing) return;

    await tx.appStateBackup.create({
      data: {
        kind: AppStateBackupKind.PRE_WRITE,
        sourceVersion,
        stateJson: current.stateJson as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async ensureDailyBackupTx(
    tx: Prisma.TransactionClient,
    stateJson: Prisma.JsonValue,
    sourceVersion: string,
    referenceDate: Date
  ): Promise<boolean> {
    const backupDay = toBackupDay(referenceDate, env.DEFAULT_TIMEZONE);
    const existing = await tx.appStateBackup.findUnique({
      where: {
        backupDay_kind: {
          backupDay,
          kind: AppStateBackupKind.DAILY,
        },
      },
      select: { id: true },
    });

    await tx.appStateBackup.upsert({
      where: {
        backupDay_kind: {
          backupDay,
          kind: AppStateBackupKind.DAILY,
        },
      },
      update: {
        sourceVersion,
        stateJson: stateJson as unknown as Prisma.InputJsonValue,
      },
      create: {
        kind: AppStateBackupKind.DAILY,
        backupDay,
        sourceVersion,
        stateJson: stateJson as unknown as Prisma.InputJsonValue,
      },
    });

    return !existing;
  }

  private async pruneExpiredBackupsTx(
    tx: Prisma.TransactionClient,
    referenceDate: Date
  ): Promise<number> {
    const cutoff = addDays(referenceDate, -env.APP_STATE_BACKUP_RETENTION_DAYS);
    const deleted = await tx.appStateBackup.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });
    return deleted.count;
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
      saleDrafts: [],
      cashRegisterAmount: 0,
      dailySalesHistory: [],
    };
  }
}
