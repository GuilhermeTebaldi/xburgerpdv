import {
  Prisma,
  StockDirection,
  StockMovementReason,
  StockTargetType,
  type Ingredient,
} from '@prisma/client';

import { prisma } from '../db/prisma.js';
import type { RequestContext } from '../types/request-context.js';
import { toDecimal, toNumber } from '../utils/decimal.js';
import { HttpError } from '../utils/http-error.js';
import { AuditService } from './audit.service.js';
import { SessionService } from './session.service.js';

interface UpsertIngredientInput {
  externalId?: string;
  name?: string;
  unit?: string;
  currentStock?: number;
  minStock?: number;
  cost?: number;
  addonPrice?: number;
  imageUrl?: string;
}

export class IngredientService {
  private readonly sessionService = new SessionService();

  async list(includeInactive = false): Promise<Ingredient[]> {
    return prisma.ingredient.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string): Promise<Ingredient> {
    const ingredient = await prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) {
      throw new HttpError(404, 'Insumo não encontrado.');
    }
    return ingredient;
  }

  async create(input: UpsertIngredientInput, context?: RequestContext): Promise<Ingredient> {
    const ingredient = await prisma.ingredient.create({
      data: {
        externalId: input.externalId,
        name: input.name as string,
        unit: input.unit as string,
        currentStock: toDecimal(input.currentStock ?? 0),
        minStock: toDecimal(input.minStock ?? 0),
        cost: toDecimal(input.cost ?? 0),
        addonPrice: input.addonPrice !== undefined ? toDecimal(input.addonPrice) : null,
        imageUrl: input.imageUrl || null,
      },
    });

    await new AuditService(prisma).log(
      {
        entityName: 'ingredients',
        entityId: ingredient.id,
        action: 'INGREDIENT_CREATED',
        afterData: {
          name: ingredient.name,
          unit: ingredient.unit,
          currentStock: toNumber(ingredient.currentStock),
          minStock: toNumber(ingredient.minStock),
          cost: toNumber(ingredient.cost),
          addonPrice: ingredient.addonPrice ? toNumber(ingredient.addonPrice) : null,
        },
      },
      context
    );

    return ingredient;
  }

  async update(id: string, input: UpsertIngredientInput, context?: RequestContext): Promise<Ingredient> {
    const existing = await this.getById(id);

    const updated = await prisma.ingredient.update({
      where: { id },
      data: {
        externalId: input.externalId,
        name: input.name,
        unit: input.unit,
        currentStock: input.currentStock !== undefined ? toDecimal(input.currentStock) : undefined,
        minStock: input.minStock !== undefined ? toDecimal(input.minStock) : undefined,
        cost: input.cost !== undefined ? toDecimal(input.cost) : undefined,
        addonPrice: input.addonPrice !== undefined ? toDecimal(input.addonPrice) : undefined,
        imageUrl: input.imageUrl,
      },
    });

    await new AuditService(prisma).log(
      {
        entityName: 'ingredients',
        entityId: updated.id,
        action: 'INGREDIENT_UPDATED',
        beforeData: {
          name: existing.name,
          unit: existing.unit,
          currentStock: toNumber(existing.currentStock),
          minStock: toNumber(existing.minStock),
          cost: toNumber(existing.cost),
          addonPrice: existing.addonPrice ? toNumber(existing.addonPrice) : null,
        },
        afterData: {
          name: updated.name,
          unit: updated.unit,
          currentStock: toNumber(updated.currentStock),
          minStock: toNumber(updated.minStock),
          cost: toNumber(updated.cost),
          addonPrice: updated.addonPrice ? toNumber(updated.addonPrice) : null,
        },
      },
      context
    );

    return updated;
  }

  async remove(id: string, context?: RequestContext): Promise<void> {
    await this.getById(id);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.productIngredient.deleteMany({ where: { ingredientId: id } });
      await tx.ingredient.update({
        where: { id },
        data: {
          isActive: false,
        },
      });

      await new AuditService(tx).log(
        {
          entityName: 'ingredients',
          entityId: id,
          action: 'INGREDIENT_DEACTIVATED',
        },
        context
      );
    });
  }

  async addManualMovement(
    ingredientId: string,
    requestedAmount: number,
    note: string | undefined,
    sessionId: string | undefined,
    context?: RequestContext
  ) {
    const ingredient = await this.getById(ingredientId);

    const minAllowed = -toNumber(ingredient.currentStock);
    const normalizedAmount = requestedAmount < 0 ? Math.max(requestedAmount, minAllowed) : requestedAmount;

    if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
      throw new HttpError(409, 'Estoque insuficiente para baixa.');
    }

    const resolvedSession = sessionId
      ? await this.sessionService.getSessionById(sessionId)
      : await this.sessionService.getCurrentSession();

    const movement = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`
        SELECT id
        FROM ingredients
        WHERE id = ${ingredientId}::uuid
        FOR UPDATE
      `;

      const current = await tx.ingredient.findUnique({ where: { id: ingredientId } });
      if (!current) {
        throw new HttpError(404, 'Insumo não encontrado.');
      }

      const currentStock = toNumber(current.currentStock);
      const appliedAmount = normalizedAmount < 0 ? Math.max(normalizedAmount, -currentStock) : normalizedAmount;
      if (appliedAmount === 0) {
        throw new HttpError(409, 'Estoque insuficiente para baixa.');
      }

      const nextStock = currentStock + appliedAmount;
      if (nextStock < 0) {
        throw new HttpError(409, 'Operação resultaria em estoque negativo.');
      }

      const updated = await tx.ingredient.update({
        where: { id: ingredientId },
        data: {
          currentStock: toDecimal(nextStock),
        },
      });

      const movementRow = await tx.stockMovement.create({
        data: {
          targetType: StockTargetType.INGREDIENT,
          direction: appliedAmount > 0 ? StockDirection.IN : StockDirection.OUT,
          reason: StockMovementReason.MANUAL,
          isManual: true,
          quantity: toDecimal(Math.abs(appliedAmount)),
          unitCost: current.cost,
          totalCost: toDecimal(Math.abs(appliedAmount) * toNumber(current.cost)),
          sessionId: resolvedSession.id,
          ingredientId,
          note: note || null,
          createdByUserId: context?.actorUserId,
        },
      });

      await new AuditService(tx).log(
        {
          entityName: 'stock_movements',
          entityId: movementRow.id,
          action: 'INGREDIENT_MANUAL_MOVEMENT_CREATED',
          metadata: {
            ingredientId,
            requestedAmount,
            appliedAmount,
            previousStock: currentStock,
            nextStock,
          },
        },
        context
      );

      return {
        movement: movementRow,
        updated,
        requestedAmount,
        appliedAmount,
      };
    });

    return movement;
  }
}
