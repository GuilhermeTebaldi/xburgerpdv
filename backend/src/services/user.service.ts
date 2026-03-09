import bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http-error.js';

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
}

interface SetCompanyStatusInput {
  stateOwnerUserId: string;
  isActive: boolean;
}

interface LinkExistingCompanyUsersInput {
  companyName: string;
  managerEmail: string;
  operatorEmail: string;
}

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
} satisfies Record<string, unknown>;

const ADMIN_GERAL_EMAIL = 'xburger.admin@geral.com';

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

    return prisma.user.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        stateOwnerUserId: true,
        billingBlocked: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
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
          select: { id: true, email: true, name: true, role: true, isActive: true, billingBlocked: true, createdAt: true, updatedAt: true },
        }),
        tx.user.findUnique({
          where: { email: operatorEmail },
          select: { id: true, email: true, name: true, role: true, isActive: true, billingBlocked: true, createdAt: true, updatedAt: true },
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

    return users.map((user) => user.id);
  }

  async setCompanyBilling(actorUserId: string, input: SetCompanyBillingInput) {
    await assertAdminActor(actorUserId);
    const targetUserIds = await this.resolveCompanyUsers(input.stateOwnerUserId);

    await prisma.user.updateMany({
      where: { id: { in: targetUserIds } },
      data: { billingBlocked: input.blocked },
    });
  }

  async setCompanyStatus(actorUserId: string, input: SetCompanyStatusInput) {
    await assertAdminActor(actorUserId);
    const targetUserIds = await this.resolveCompanyUsers(input.stateOwnerUserId);

    await prisma.user.updateMany({
      where: { id: { in: targetUserIds } },
      data: { isActive: input.isActive },
    });
  }
}
