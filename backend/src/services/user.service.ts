import bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http-error.js';
import {
  buildDefaultBillingBlockedMessage,
  resolveBillingBlockSnapshot,
} from './billing-block.service.js';

interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  role: UserRole;
  isActive: boolean;
}

interface CompanyCredentialInput {
  email: string;
  password: string;
  name?: string;
}

interface CreateCompanyUsersInput {
  companyName: string;
  manager: CompanyCredentialInput;
  operator: CompanyCredentialInput;
  isActive: boolean;
}

interface SetCompanyBillingInput {
  stateOwnerUserId: string;
  blocked: boolean;
  message?: string;
  blockedDays?: number;
}

interface SetCompanyStatusInput {
  stateOwnerUserId: string;
  isActive: boolean;
}

interface SetCompanyLayoutThemeInput {
  stateOwnerUserId: string;
  layoutThemeId: BrandThemeId;
}

interface LinkExistingCompanyUsersInput {
  companyName: string;
  managerEmail: string;
  operatorEmail: string;
}

interface DeleteCompanyPermanentlyInput {
  stateOwnerUserId: string;
  firstConfirmation: string;
  secondConfirmation: string;
}

type BrandThemeId = 'red' | 'orange' | 'amber' | 'blue' | 'emerald' | 'violet';

const EMPTY_APP_STATE = {
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
} satisfies Record<string, unknown>;

const ADMIN_GERAL_EMAIL = 'xburger.admin@geral.com';
const DELETE_CONFIRMATION_PHRASE = 'EXCLUIRUSER';
const DEFAULT_BILLING_BLOCK_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const BRAND_THEME_IDS = ['red', 'orange', 'amber', 'blue', 'emerald', 'violet'] as const;
const BRAND_THEME_ID_SET = new Set<string>(BRAND_THEME_IDS);

const normalizeLayoutThemeId = (value: unknown): BrandThemeId | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!BRAND_THEME_ID_SET.has(normalized)) return null;
  return normalized as BrandThemeId;
};

const extractLayoutThemeIdFromStateJson = (stateJson: Prisma.JsonValue): BrandThemeId | null => {
  if (!stateJson || typeof stateJson !== 'object' || Array.isArray(stateJson)) return null;
  const record = stateJson as Record<string, unknown>;
  return normalizeLayoutThemeId(record.layoutThemeId);
};

const mergeLayoutThemeIntoStateJson = (
  stateJson: Prisma.JsonValue | null | undefined,
  layoutThemeId: BrandThemeId
): Record<string, unknown> => {
  if (!stateJson || typeof stateJson !== 'object' || Array.isArray(stateJson)) {
    return { ...EMPTY_APP_STATE, layoutThemeId };
  }

  const record = stateJson as Record<string, unknown>;
  return {
    ...record,
    layoutThemeId,
  };
};

const isMissingAppStateTableError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === 'P2021' || error.code === 'P2022');

const assertAdminActor = async (actorUserId: string) => {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      isActive: true,
      role: true,
    },
  });

  if (!actor || !actor.isActive) {
    throw new HttpError(401, 'Usuário autenticado não encontrado.');
  }

  if (actor.role !== UserRole.ADMIN) {
    throw new HttpError(403, 'Acesso permitido somente para administradores.');
  }
};

export class UserService {
  async list(actorUserId: string, includeInactive = true) {
    await assertAdminActor(actorUserId);

    const users = await prisma.user.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        stateOwnerUserId: true,
        billingBlocked: true,
        billingBlockedMessage: true,
        billingBlockedUntil: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const ownerUserIds = [...new Set(users.map((user) => user.stateOwnerUserId?.trim() || user.id))];
    let appStates: Array<{ ownerUserId: string | null; stateJson: Prisma.JsonValue }> = [];
    if (ownerUserIds.length) {
      try {
        appStates = await prisma.appState.findMany({
          where: {
            ownerUserId: {
              in: ownerUserIds,
            },
          },
          select: {
            ownerUserId: true,
            stateJson: true,
          },
        });
      } catch (error) {
        if (!isMissingAppStateTableError(error)) {
          throw error;
        }
      }
    }

    const themeByOwnerId = new Map(
      appStates
        .filter((entry): entry is { ownerUserId: string; stateJson: Prisma.JsonValue } => Boolean(entry.ownerUserId))
        .map((entry) => [entry.ownerUserId, extractLayoutThemeIdFromStateJson(entry.stateJson)])
    );

    return users.map((user) => {
      const billing = resolveBillingBlockSnapshot(user);
      const ownerUserId = user.stateOwnerUserId?.trim() || user.id;
      return {
        ...user,
        billingBlocked: billing.isBlocked,
        billingBlockedMessage: billing.message,
        billingBlockedUntil: billing.blockedUntil,
        layoutThemeId: themeByOwnerId.get(ownerUserId) ?? null,
      };
    });
  }

  async create(actorUserId: string, input: CreateUserInput) {
    await assertAdminActor(actorUserId);

    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedName = input.name?.trim() || null;

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      throw new HttpError(409, 'Já existe um usuário cadastrado com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: normalizedName,
        role: input.role,
        isActive: input.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        stateOwnerUserId: true,
        billingBlocked: true,
        billingBlockedMessage: true,
        billingBlockedUntil: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.user.update({
      where: { id: created.id },
      data: { stateOwnerUserId: created.id },
    });

    await prisma.appState.upsert({
      where: { ownerUserId: created.id },
      create: {
        ownerUserId: created.id,
        stateJson: EMPTY_APP_STATE as Prisma.InputJsonValue,
      },
      update: {},
    });

    return {
      ...created,
      stateOwnerUserId: created.id,
    };
  }

  async createCompanyUsers(actorUserId: string, input: CreateCompanyUsersInput) {
    await assertAdminActor(actorUserId);

    const companyName = input.companyName.trim();
    const managerEmail = input.manager.email.trim().toLowerCase();
    const operatorEmail = input.operator.email.trim().toLowerCase();
    const managerName = input.manager.name?.trim() || null;
    const operatorName = input.operator.name?.trim() || null;

    if (managerEmail === operatorEmail) {
      throw new HttpError(409, 'E-mail do operador deve ser diferente do ADMGERENTE.');
    }

    const managerPasswordHash = await bcrypt.hash(input.manager.password, 12);
    const operatorPasswordHash = await bcrypt.hash(input.operator.password, 12);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const manager = await tx.user.upsert({
        where: { email: managerEmail },
        create: {
          email: managerEmail,
          passwordHash: managerPasswordHash,
          name: managerName,
          companyName,
          role: UserRole.ADMIN,
          isActive: input.isActive,
        },
        update: {
          passwordHash: managerPasswordHash,
          name: managerName,
          companyName,
          role: UserRole.ADMIN,
          isActive: input.isActive,
        },
        select: {
          id: true,
          email: true,
          name: true,
          companyName: true,
          stateOwnerUserId: true,
          billingBlocked: true,
          billingBlockedMessage: true,
          billingBlockedUntil: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const operator = await tx.user.upsert({
        where: { email: operatorEmail },
        create: {
          email: operatorEmail,
          passwordHash: operatorPasswordHash,
          name: operatorName,
          companyName,
          role: UserRole.OPERATOR,
          isActive: input.isActive,
          stateOwnerUserId: manager.id,
        },
        update: {
          passwordHash: operatorPasswordHash,
          name: operatorName,
          companyName,
          role: UserRole.OPERATOR,
          isActive: input.isActive,
          stateOwnerUserId: manager.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          companyName: true,
          stateOwnerUserId: true,
          billingBlocked: true,
          billingBlockedMessage: true,
          billingBlockedUntil: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const managerState = await tx.appState.findUnique({
        where: { ownerUserId: manager.id },
        select: { ownerUserId: true, updatedAt: true },
      });
      const operatorState = await tx.appState.findUnique({
        where: { ownerUserId: operator.id },
        select: { ownerUserId: true, updatedAt: true },
      });

      const sharedOwnerId =
        managerState && operatorState
          ? managerState.updatedAt >= operatorState.updatedAt
            ? manager.id
            : operator.id
          : managerState
            ? manager.id
            : operatorState
              ? operator.id
              : manager.id;

      await tx.user.update({
        where: { id: manager.id },
        data: { stateOwnerUserId: sharedOwnerId },
      });
      await tx.user.update({
        where: { id: operator.id },
        data: { stateOwnerUserId: sharedOwnerId },
      });

      await tx.appState.upsert({
        where: { ownerUserId: sharedOwnerId },
        create: {
          ownerUserId: sharedOwnerId,
          stateJson: EMPTY_APP_STATE as Prisma.InputJsonValue,
        },
        update: {},
      });

      return {
        manager: {
          ...manager,
          stateOwnerUserId: sharedOwnerId,
        },
        operator: {
          ...operator,
          stateOwnerUserId: sharedOwnerId,
        },
      };
    });

    return result;
  }

  async linkExistingCompanyUsers(actorUserId: string, input: LinkExistingCompanyUsersInput) {
    await assertAdminActor(actorUserId);

    const companyName = input.companyName.trim();
    const managerEmail = input.managerEmail.trim().toLowerCase();
    const operatorEmail = input.operatorEmail.trim().toLowerCase();

    if (managerEmail === operatorEmail) {
      throw new HttpError(409, 'E-mail do operador deve ser diferente do ADMGERENTE.');
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const [manager, operator] = await Promise.all([
        tx.user.findUnique({
          where: { email: managerEmail },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            billingBlocked: true,
            billingBlockedMessage: true,
            billingBlockedUntil: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        tx.user.findUnique({
          where: { email: operatorEmail },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            billingBlocked: true,
            billingBlockedMessage: true,
            billingBlockedUntil: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      if (!manager) {
        throw new HttpError(404, 'ADMGERENTE não encontrado para o e-mail informado.');
      }
      if (!operator) {
        throw new HttpError(404, 'OPERADOR não encontrado para o e-mail informado.');
      }

      const touchesAdminGeral = [manager, operator].some(
        (user) => user.email.trim().toLowerCase() === ADMIN_GERAL_EMAIL
      );
      if (touchesAdminGeral) {
        throw new HttpError(403, 'Conta de gestão não pode ser vinculada como empresa cliente.');
      }

      const managerState = await tx.appState.findUnique({
        where: { ownerUserId: manager.id },
        select: { ownerUserId: true, updatedAt: true },
      });
      const operatorState = await tx.appState.findUnique({
        where: { ownerUserId: operator.id },
        select: { ownerUserId: true, updatedAt: true },
      });

      const sharedOwnerId =
        managerState && operatorState
          ? managerState.updatedAt >= operatorState.updatedAt
            ? manager.id
            : operator.id
          : managerState
            ? manager.id
            : operatorState
              ? operator.id
              : manager.id;

      await tx.user.update({
        where: { id: manager.id },
        data: {
          companyName,
          role: UserRole.ADMIN,
          stateOwnerUserId: sharedOwnerId,
        },
      });
      await tx.user.update({
        where: { id: operator.id },
        data: {
          companyName,
          role: UserRole.OPERATOR,
          stateOwnerUserId: sharedOwnerId,
        },
      });

      await tx.appState.upsert({
        where: { ownerUserId: sharedOwnerId },
        create: {
          ownerUserId: sharedOwnerId,
          stateJson: EMPTY_APP_STATE as Prisma.InputJsonValue,
        },
        update: {},
      });

      return {
        managerEmail,
        operatorEmail,
        sharedOwnerId,
      };
    });
  }

  private async resolveCompanyUsers(stateOwnerUserId: string) {
    const ownerId = stateOwnerUserId.trim();
    if (!ownerId) {
      throw new HttpError(400, 'Vínculo da empresa inválido.');
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { stateOwnerUserId: ownerId },
          { id: ownerId },
        ],
      },
      select: {
        id: true,
        email: true,
        stateOwnerUserId: true,
      },
    });

    if (users.length === 0) {
      throw new HttpError(404, 'Empresa não encontrada para o vínculo informado.');
    }

    const touchesAdminGeral = users.some(
      (user) => user.email.trim().toLowerCase() === ADMIN_GERAL_EMAIL
    );
    if (touchesAdminGeral) {
      throw new HttpError(403, 'Conta de gestão não pode ser alterada por estas ações.');
    }

    return users;
  }

  async setCompanyBilling(actorUserId: string, input: SetCompanyBillingInput) {
    await assertAdminActor(actorUserId);
    const companyUsers = await this.resolveCompanyUsers(input.stateOwnerUserId);
    const targetUserIds = companyUsers.map((user) => user.id);

    const blockedDays = Math.max(1, Math.floor(input.blockedDays ?? DEFAULT_BILLING_BLOCK_DAYS));
    const blockedUntil = new Date(Date.now() + blockedDays * DAY_MS);
    const defaultMessage = buildDefaultBillingBlockedMessage(blockedDays, blockedUntil);
    const normalizedMessage = input.message?.trim() || defaultMessage;

    await prisma.user.updateMany({
      where: { id: { in: targetUserIds } },
      data: input.blocked
        ? {
            billingBlocked: true,
            billingBlockedMessage: normalizedMessage,
            billingBlockedUntil: blockedUntil,
          }
        : {
            billingBlocked: false,
            billingBlockedMessage: null,
            billingBlockedUntil: null,
            isActive: true,
          },
    });
  }

  async setCompanyStatus(actorUserId: string, input: SetCompanyStatusInput) {
    await assertAdminActor(actorUserId);
    const companyUsers = await this.resolveCompanyUsers(input.stateOwnerUserId);
    const targetUserIds = companyUsers.map((user) => user.id);

    await prisma.user.updateMany({
      where: { id: { in: targetUserIds } },
      data: { isActive: input.isActive },
    });
  }

  async setCompanyLayoutTheme(actorUserId: string, input: SetCompanyLayoutThemeInput) {
    await assertAdminActor(actorUserId);
    const companyUsers = await this.resolveCompanyUsers(input.stateOwnerUserId);
    const targetUserIds = companyUsers.map((user) => user.id);
    const targetUserIdSet = new Set(targetUserIds);

    const ownerUserIds = [
      ...new Set(
        companyUsers.map((user) => {
          const owner = user.stateOwnerUserId?.trim();
          if (owner && targetUserIdSet.has(owner)) return owner;
          return user.id;
        })
      ),
    ];

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const ownerUserId of ownerUserIds) {
        const current = await tx.appState.findUnique({
          where: { ownerUserId },
          select: {
            stateJson: true,
          },
        });

        const nextStateJson = mergeLayoutThemeIntoStateJson(current?.stateJson, input.layoutThemeId);

        await tx.appState.upsert({
          where: { ownerUserId },
          create: {
            ownerUserId,
            stateJson: nextStateJson as Prisma.InputJsonValue,
          },
          update: {
            stateJson: nextStateJson as Prisma.InputJsonValue,
          },
        });
      }
    });

    return {
      layoutThemeId: input.layoutThemeId,
      updatedOwnersCount: ownerUserIds.length,
      updatedOwnerUserIds: ownerUserIds,
    };
  }

  async deleteCompanyPermanently(actorUserId: string, input: DeleteCompanyPermanentlyInput) {
    await assertAdminActor(actorUserId);

    if (
      input.firstConfirmation !== DELETE_CONFIRMATION_PHRASE ||
      input.secondConfirmation !== DELETE_CONFIRMATION_PHRASE
    ) {
      throw new HttpError(
        400,
        `Confirmação inválida. Digite ${DELETE_CONFIRMATION_PHRASE} duas vezes para excluir definitivamente.`
      );
    }

    const companyUsers = await this.resolveCompanyUsers(input.stateOwnerUserId);
    const targetUserIds = companyUsers.map((user) => user.id);
    const targetUserIdSet = new Set(targetUserIds);

    const ownerUserIds = [...new Set(
      companyUsers.map((user) => {
        const owner = user.stateOwnerUserId?.trim();
        if (owner && targetUserIdSet.has(owner)) return owner;
        return user.id;
      })
    )];

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const [deletedBackups, deletedStates, deletedAuditLogs, deletedUsers] = await Promise.all([
        tx.appStateBackup.deleteMany({
          where: {
            ownerUserId: { in: ownerUserIds },
          },
        }),
        tx.appState.deleteMany({
          where: {
            ownerUserId: { in: ownerUserIds },
          },
        }),
        tx.auditLog.deleteMany({
          where: {
            actorUserId: { in: targetUserIds },
          },
        }),
        tx.user.deleteMany({
          where: {
            id: { in: targetUserIds },
          },
        }),
      ]);

      return {
        deletedUsersCount: deletedUsers.count,
        deletedAppStatesCount: deletedStates.count,
        deletedBackupsCount: deletedBackups.count,
        deletedAuditLogsCount: deletedAuditLogs.count,
      };
    });
  }
}
