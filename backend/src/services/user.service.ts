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
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.appState.upsert({
      where: { ownerUserId: created.id },
      create: {
        ownerUserId: created.id,
        stateJson: EMPTY_APP_STATE as Prisma.InputJsonValue,
      },
      update: {},
    });

    return created;
  }
}
