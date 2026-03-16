import { AppStateBackupKind, Prisma } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import type { FrontAppState } from '../types/frontend.js';
import type { RequestContext } from '../types/request-context.js';
import { HttpError } from '../utils/http-error.js';
import type { StateCommandInput } from '../validators/state-command.validator.js';
import { AuditService } from './audit.service.js';
import { resolveBillingBlockSnapshot, toBillingBlockErrorDetails } from './billing-block.service.js';
import {
  buildSalesByDayMap,
  normalizeDailySalesHistoryList,
} from './daily-history-normalizer.service.js';
import { addDays, toBackupDay, toDateOnlyKey } from './state-backup.utils.js';
import { applyStateCommand, commandTouchesArchiveState } from './state-command.service.js';

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
  layoutThemeId: null,
  layoutCompanyName: null,
};

const arrayOrEmpty = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const toNonNegativeNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const VALID_LAYOUT_THEME_IDS = new Set(['red', 'orange', 'amber', 'blue', 'emerald', 'violet']);

const toLayoutThemeId = (value: unknown): FrontAppState['layoutThemeId'] => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Tema de layout inválido.');
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!VALID_LAYOUT_THEME_IDS.has(normalized)) {
    throw new HttpError(400, 'Tema de layout inválido.');
  }
  return normalized as NonNullable<FrontAppState['layoutThemeId']>;
};

const toLayoutCompanyName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 120);
};

const normalizeStatePayload = (value: unknown): FrontAppState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Payload de estado inválido. Deve ser um objeto AppState.');
  }

  const payload = value as Record<string, unknown>;
  const globalSales: FrontAppState['globalSales'] = arrayOrEmpty(payload.globalSales);
  const dailySalesHistorySource: FrontAppState['dailySalesHistory'] = arrayOrEmpty(payload.dailySalesHistory);
  const dailySalesHistory = normalizeDailySalesHistoryList(dailySalesHistorySource, {
    salesByDay: buildSalesByDayMap(globalSales),
  });

  return {
    ingredients: arrayOrEmpty(payload.ingredients),
    products: arrayOrEmpty(payload.products),
    sales: arrayOrEmpty(payload.sales),
    stockEntries: arrayOrEmpty(payload.stockEntries),
    cleaningMaterials: arrayOrEmpty(payload.cleaningMaterials),
    cleaningStockEntries: arrayOrEmpty(payload.cleaningStockEntries),
    globalSales,
    globalCancelledSales: arrayOrEmpty(payload.globalCancelledSales),
    globalStockEntries: arrayOrEmpty(payload.globalStockEntries),
    globalCleaningStockEntries: arrayOrEmpty(payload.globalCleaningStockEntries),
    saleDrafts: arrayOrEmpty(payload.saleDrafts),
    cashRegisterAmount: toNonNegativeNumber(payload.cashRegisterAmount),
    dailySalesHistory,
    layoutThemeId: toLayoutThemeId(payload.layoutThemeId),
    layoutCompanyName: toLayoutCompanyName(payload.layoutCompanyName),
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
      layoutThemeId: null,
      layoutCompanyName: null,
    };
  }
  return normalizeStatePayload(value);
};

const toVersionTag = (value: Date): string => value.toISOString();
const ADMIN_GERAL_EMAIL = 'xburger.admin@geral.com';

interface HotStatePatch {
  ingredients: FrontAppState['ingredients'];
  products: FrontAppState['products'];
  sales: FrontAppState['sales'];
  stockEntries: FrontAppState['stockEntries'];
  cleaningMaterials: FrontAppState['cleaningMaterials'];
  cleaningStockEntries: FrontAppState['cleaningStockEntries'];
  saleDrafts: FrontAppState['saleDrafts'];
  cashRegisterAmount: FrontAppState['cashRegisterAmount'];
}

interface PersistedStateRow {
  stateJson: Prisma.JsonValue;
  updatedAt: Date;
}

const toHotStatePatch = (state: FrontAppState): HotStatePatch => ({
  ingredients: state.ingredients,
  products: state.products,
  sales: state.sales,
  stockEntries: state.stockEntries,
  cleaningMaterials: state.cleaningMaterials,
  cleaningStockEntries: state.cleaningStockEntries,
  saleDrafts: state.saleDrafts,
  cashRegisterAmount: state.cashRegisterAmount,
});

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
  private async resolveOwnerUserId(actorUserId: string | undefined): Promise<string> {
    const actorId = actorUserId?.trim();
    if (!actorId) {
      throw new HttpError(401, 'Usuário autenticado não encontrado para acessar o estado.');
    }

    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        email: true,
        isActive: true,
        billingBlocked: true,
        billingBlockedMessage: true,
        billingBlockedUntil: true,
        stateOwnerUserId: true,
      },
    });

    if (!actor || !actor.isActive) {
      throw new HttpError(401, 'Usuário autenticado não encontrado para acessar o estado.');
    }
    const isAdminGeral = actor.email.trim().toLowerCase() === ADMIN_GERAL_EMAIL;
    const billingBlock = resolveBillingBlockSnapshot(actor);
    if (billingBlock.isBlocked && !isAdminGeral) {
      throw new HttpError(
        402,
        billingBlock.message || 'Empresa bloqueada por inadimplência.',
        toBillingBlockErrorDetails(billingBlock)
      );
    }

    const ownerUserId = actor.stateOwnerUserId?.trim() || actor.id;
    if (!ownerUserId) {
      throw new HttpError(401, 'Vínculo de empresa inválido para acessar o estado.');
    }

    return ownerUserId;
  }

  async getAppState(actorUserId: string): Promise<AppStateSnapshot> {
    const ownerUserId = await this.resolveOwnerUserId(actorUserId);
    try {
      const snapshot = await prisma.appState.findUnique({ where: { ownerUserId } });
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

    return this.persistSnapshot(EMPTY_APP_STATE, 'APP_STATE_BOOTSTRAPPED', ownerUserId);
  }

  async getAppStateVersion(actorUserId: string): Promise<string> {
    const snapshot = await this.getAppState(actorUserId);
    return snapshot.version;
  }

  async saveAppState(
    actorUserId: string,
    state: unknown,
    expectedVersion: string,
    context?: RequestContext
  ): Promise<AppStateSnapshot> {
    const ownerUserId = await this.resolveOwnerUserId(actorUserId);
    const normalized = normalizeStatePayload(state);
    return this.persistSnapshot(normalized, 'APP_STATE_UPSERTED', ownerUserId, context, expectedVersion);
  }

  async clearAppState(
    actorUserId: string,
    expectedVersion: string,
    context?: RequestContext
  ): Promise<AppStateSnapshot> {
    const ownerUserId = await this.resolveOwnerUserId(actorUserId);
    return this.persistSnapshot(EMPTY_APP_STATE, 'APP_STATE_CLEARED', ownerUserId, context, expectedVersion);
  }

  async applyCommand(
    actorUserId: string,
    command: StateCommandInput,
    expectedVersion: string,
    context?: RequestContext
  ): Promise<AppStateSnapshot> {
    const ownerUserId = await this.resolveOwnerUserId(actorUserId);
    try {
      return await this.applyCommandSnapshot(ownerUserId, command, expectedVersion, context);
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }

      await this.bootstrapAppStateTables();
      return this.applyCommandSnapshot(ownerUserId, command, expectedVersion, context);
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
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    );
  }

  private async bootstrapAppStateTables(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_state (
        id integer PRIMARY KEY,
        owner_user_id uuid,
        state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT app_state_owner_user_id_fkey
          FOREIGN KEY (owner_user_id) REFERENCES users(id)
          ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE app_state DROP CONSTRAINT IF EXISTS app_state_singleton
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE app_state ADD COLUMN IF NOT EXISTS owner_user_id uuid
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'app_state_owner_user_id_fkey'
        ) THEN
          ALTER TABLE app_state
            ADD CONSTRAINT app_state_owner_user_id_fkey
            FOREIGN KEY (owner_user_id) REFERENCES users(id)
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE app_state ALTER COLUMN id DROP DEFAULT
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_class
          WHERE relname = 'app_state_id_seq'
        ) THEN
          CREATE SEQUENCE app_state_id_seq OWNED BY app_state.id;
        END IF;
      END
      $$;
    `);

    await prisma.$queryRawUnsafe(`
      SELECT setval(
        'app_state_id_seq',
        GREATEST(COALESCE((SELECT MAX(id) FROM app_state), 0), 1),
        true
      )
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE app_state ALTER COLUMN id SET DEFAULT nextval('app_state_id_seq')
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS app_state_owner_user_id_key
      ON app_state (owner_user_id)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS app_state_owner_user_id_idx
      ON app_state (owner_user_id)
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
        owner_user_id uuid,
        kind app_state_backup_kind NOT NULL,
        source_version varchar(80) NOT NULL,
        backup_day date,
        state_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT app_state_backups_owner_user_id_fkey
          FOREIGN KEY (owner_user_id) REFERENCES users(id)
          ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE app_state_backups ADD COLUMN IF NOT EXISTS owner_user_id uuid
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'app_state_backups_owner_user_id_fkey'
        ) THEN
          ALTER TABLE app_state_backups
            ADD CONSTRAINT app_state_backups_owner_user_id_fkey
            FOREIGN KEY (owner_user_id) REFERENCES users(id)
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS app_state_backups_backup_day_kind_key
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS app_state_backups_owner_user_id_backup_day_kind_key
      ON app_state_backups (owner_user_id, backup_day, kind)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS app_state_backups_kind_created_at_idx
      ON app_state_backups (kind, created_at)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS app_state_backups_owner_kind_created_at_idx
      ON app_state_backups (owner_user_id, kind, created_at)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS app_state_backups_source_version_idx
      ON app_state_backups (source_version)
    `);
  }

  private async persistSnapshot(
    state: FrontAppState,
    action: 'APP_STATE_BOOTSTRAPPED' | 'APP_STATE_UPSERTED' | 'APP_STATE_CLEARED',
    ownerUserId: string,
    context?: RequestContext,
    expectedVersion?: string
  ): Promise<AppStateSnapshot> {
    try {
      return await this.upsertSnapshot(state, action, ownerUserId, context, expectedVersion);
    } catch (error) {
      if (!this.isMissingAppStateTableError(error)) {
        throw error;
      }

      await this.bootstrapAppStateTables();
      return this.upsertSnapshot(state, action, ownerUserId, context, expectedVersion);
    }
  }

  private async upsertSnapshot(
    state: FrontAppState,
    action: 'APP_STATE_BOOTSTRAPPED' | 'APP_STATE_UPSERTED' | 'APP_STATE_CLEARED',
    ownerUserId: string,
    context?: RequestContext,
    expectedVersion?: string
  ): Promise<AppStateSnapshot> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.appState.findUnique({ where: { ownerUserId } });
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

      await this.ensurePreWriteBackupTx(tx, current, ownerUserId);

      const saved = current
        ? await tx.appState.update({
            where: { ownerUserId },
            data: {
              stateJson: state as unknown as Prisma.InputJsonValue,
            },
          })
        : await tx.appState.create({
            data: {
              ownerUserId,
              stateJson: state as unknown as Prisma.InputJsonValue,
            },
          });

      await this.ensureDailyBackupTx(
        tx,
        saved.stateJson as Prisma.JsonValue,
        toVersionTag(saved.updatedAt),
        operationNow,
        ownerUserId
      );

      await new AuditService(tx).log(
        {
          entityName: 'app_state',
          entityId: ownerUserId,
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
    ownerUserId: string,
    command: StateCommandInput,
    expectedVersion: string,
    context?: RequestContext
  ): Promise<AppStateSnapshot> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.appState.findUnique({ where: { ownerUserId } });
      const currentVersion = current ? toVersionTag(current.updatedAt) : null;
      const operationNow = new Date();
      this.assertExpectedVersion(expectedVersion, currentVersion);

      const currentState = current
        ? normalizeStatePayloadSafe(current.stateJson)
        : normalizeStatePayloadSafe({});
      const nextState = applyStateCommand(currentState, command, { mutateInPlace: true });

      // Commands that do not touch historical/global collections update only "hot" keys.
      // This preserves full history while avoiding heavy JSON writes on frequent cart operations.
      const shouldUpdateArchive = commandTouchesArchiveState(command.type);
      const saved: PersistedStateRow = current
        ? shouldUpdateArchive
          ? await tx.appState.update({
              where: { ownerUserId },
              data: {
                stateJson: nextState as unknown as Prisma.InputJsonValue,
              },
            })
          : await this.updateHotStateTx(tx, nextState, ownerUserId)
        : await tx.appState.create({
            data: {
              ownerUserId,
              stateJson: nextState as unknown as Prisma.InputJsonValue,
            },
          });

      await this.ensureDailyBackupTx(
        tx,
        saved.stateJson as Prisma.JsonValue,
        toVersionTag(saved.updatedAt),
        operationNow,
        ownerUserId
      );

      await new AuditService(tx).log(
        {
          entityName: 'app_state',
          entityId: ownerUserId,
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

  private async updateHotStateTx(
    tx: Prisma.TransactionClient,
    state: FrontAppState,
    ownerUserId: string
  ): Promise<PersistedStateRow> {
    const patch = JSON.stringify(toHotStatePatch(state));
    const rows = await tx.$queryRaw<Array<{ state_json: Prisma.JsonValue; updated_at: Date }>>(
      Prisma.sql`
        UPDATE app_state
        SET state_json = state_json || ${patch}::jsonb,
            updated_at = now()
        WHERE owner_user_id = ${ownerUserId}::uuid
        RETURNING state_json, updated_at
      `
    );

    const row = rows[0];
    if (!row) {
      throw new HttpError(500, 'Falha ao persistir estado operacional.');
    }

    return {
      stateJson: row.state_json,
      updatedAt: row.updated_at,
    };
  }

  private async createDailyBackup(
    referenceDate: Date,
    context?: RequestContext
  ): Promise<DailyBackupResult> {
    const backupDay = toBackupDay(referenceDate, env.DEFAULT_TIMEZONE);
    const backupDayKey = toDateOnlyKey(backupDay);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const snapshots = await tx.appState.findMany({
        select: {
          ownerUserId: true,
          stateJson: true,
          updatedAt: true,
        },
      });

      let created = false;
      let sourceVersion = 'none';

      for (const snapshot of snapshots) {
        sourceVersion = toVersionTag(snapshot.updatedAt);
        const scopeCreated = await this.ensureDailyBackupTx(
          tx,
          snapshot.stateJson as Prisma.JsonValue,
          sourceVersion,
          referenceDate,
          snapshot.ownerUserId ?? null
        );
        if (scopeCreated) {
          created = true;
        }
      }

      const prunedCount = await this.pruneExpiredBackupsTx(tx, referenceDate);

      await new AuditService(tx).log(
        {
          entityName: 'app_state',
          entityId: '*',
          action: 'APP_STATE_BACKUP_DAILY',
          metadata: {
            backupDay: backupDayKey,
            created,
            sourceVersion,
            prunedCount,
            scopesProcessed: snapshots.length,
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
    current: { stateJson: Prisma.JsonValue; updatedAt: Date } | null,
    ownerUserId: string
  ): Promise<void> {
    if (!current) return;

    const sourceVersion = toVersionTag(current.updatedAt);
    const existing = await tx.appStateBackup.findFirst({
      where: {
        ownerUserId,
        kind: AppStateBackupKind.PRE_WRITE,
        sourceVersion,
      },
      select: { id: true },
    });

    if (existing) return;

    await tx.appStateBackup.create({
      data: {
        ownerUserId,
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
    referenceDate: Date,
    ownerUserId: string | null
  ): Promise<boolean> {
    const backupDay = toBackupDay(referenceDate, env.DEFAULT_TIMEZONE);
    if (ownerUserId === null) {
      const existing = await tx.appStateBackup.findFirst({
        where: {
          ownerUserId: null,
          backupDay,
          kind: AppStateBackupKind.DAILY,
        },
        select: { id: true },
      });

      if (!existing) {
        await tx.appStateBackup.create({
          data: {
            ownerUserId: null,
            kind: AppStateBackupKind.DAILY,
            backupDay,
            sourceVersion,
            stateJson: stateJson as unknown as Prisma.InputJsonValue,
          },
        });
        return true;
      }

      await tx.appStateBackup.update({
        where: { id: existing.id },
        data: {
          sourceVersion,
          stateJson: stateJson as unknown as Prisma.InputJsonValue,
        },
      });
      return false;
    }

    const created = await tx.appStateBackup.createMany({
      data: {
        ownerUserId,
        kind: AppStateBackupKind.DAILY,
        backupDay,
        sourceVersion,
        stateJson: stateJson as unknown as Prisma.InputJsonValue,
      },
      skipDuplicates: true,
    });

    if (created.count > 0) {
      return true;
    }

    await tx.appStateBackup.update({
      where: {
        ownerUserId_backupDay_kind: {
          ownerUserId,
          backupDay,
          kind: AppStateBackupKind.DAILY,
        },
      },
      data: {
        sourceVersion,
        stateJson: stateJson as unknown as Prisma.InputJsonValue,
      },
    });

    return false;
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
}
