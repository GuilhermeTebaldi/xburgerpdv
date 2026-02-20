import {
  Prisma,
  StockDirection,
  StockMovementReason,
  StockTargetType,
  type CleaningMaterial,
} from '@prisma/client';

import { prisma } from '../db/prisma.js';
import type { RequestContext } from '../types/request-context.js';
import { toDecimal, toNumber } from '../utils/decimal.js';
import { HttpError } from '../utils/http-error.js';
import { AuditService } from './audit.service.js';
import { SessionService } from './session.service.js';

interface UpsertCleaningMaterialInput {
  externalId?: string;
  name?: string;
  unit?: string;
  currentStock?: number;
  minStock?: number;
  cost?: number;
  imageUrl?: string;
}

export class CleaningMaterialService {
  private readonly sessionService = new SessionService();

  async list(includeInactive = false): Promise<CleaningMaterial[]> {
    return prisma.cleaningMaterial.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string): Promise<CleaningMaterial> {
    const material = await prisma.cleaningMaterial.findUnique({ where: { id } });
    if (!material) {
      throw new HttpError(404, 'Material de limpeza não encontrado.');
    }
    return material;
  }

  async create(input: UpsertCleaningMaterialInput, context?: RequestContext): Promise<CleaningMaterial> {
    const material = await prisma.cleaningMaterial.create({
      data: {
        externalId: input.externalId,
        name: input.name as string,
        unit: input.unit as string,
        currentStock: toDecimal(input.currentStock ?? 0),
        minStock: toDecimal(input.minStock ?? 0),
        cost: toDecimal(input.cost ?? 0),
        imageUrl: input.imageUrl || null,
      },
    });

    await new AuditService(prisma).log(
      {
        entityName: 'cleaning_materials',
        entityId: material.id,
        action: 'CLEANING_MATERIAL_CREATED',
      },
      context
    );

    return material;
  }

  async update(
    id: string,
    input: UpsertCleaningMaterialInput,
    context?: RequestContext
  ): Promise<CleaningMaterial> {
    const existing = await this.getById(id);

    const updated = await prisma.cleaningMaterial.update({
      where: { id },
      data: {
        externalId: input.externalId,
        name: input.name,
        unit: input.unit,
        currentStock: input.currentStock !== undefined ? toDecimal(input.currentStock) : undefined,
        minStock: input.minStock !== undefined ? toDecimal(input.minStock) : undefined,
        cost: input.cost !== undefined ? toDecimal(input.cost) : undefined,
        imageUrl: input.imageUrl,
      },
    });

    await new AuditService(prisma).log(
      {
        entityName: 'cleaning_materials',
        entityId: updated.id,
        action: 'CLEANING_MATERIAL_UPDATED',
        beforeData: {
          name: existing.name,
          stock: toNumber(existing.currentStock),
        },
        afterData: {
          name: updated.name,
          stock: toNumber(updated.currentStock),
        },
      },
      context
    );

    return updated;
  }

  async remove(id: string, context?: RequestContext): Promise<void> {
    await this.getById(id);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.cleaningMaterial.update({
        where: { id },
        data: { isActive: false },
      });

      await new AuditService(tx).log(
        {
          entityName: 'cleaning_materials',
          entityId: id,
          action: 'CLEANING_MATERIAL_DEACTIVATED',
        },
        context
      );
    });
  }

  async addManualMovement(
    materialId: string,
    requestedAmount: number,
    note: string | undefined,
    sessionId: string | undefined,
    context?: RequestContext
  ) {
    const material = await this.getById(materialId);

    const minAllowed = -toNumber(material.currentStock);
    const normalizedAmount = requestedAmount < 0 ? Math.max(requestedAmount, minAllowed) : requestedAmount;

    if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
      throw new HttpError(409, 'Estoque insuficiente para baixa de material.');
    }

    const resolvedSession = sessionId
      ? await this.sessionService.getSessionById(sessionId)
      : await this.sessionService.getCurrentSession();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`
        SELECT id
        FROM cleaning_materials
        WHERE id = ${materialId}::uuid
        FOR UPDATE
      `;

      const current = await tx.cleaningMaterial.findUnique({ where: { id: materialId } });
      if (!current) {
        throw new HttpError(404, 'Material não encontrado.');
      }

      const currentStock = toNumber(current.currentStock);
      const appliedAmount = normalizedAmount < 0 ? Math.max(normalizedAmount, -currentStock) : normalizedAmount;
      if (appliedAmount === 0) {
        throw new HttpError(409, 'Estoque insuficiente para baixa de material.');
      }

      const nextStock = currentStock + appliedAmount;
      if (nextStock < 0) {
        throw new HttpError(409, 'Operação resultaria em estoque negativo.');
      }

      const updated = await tx.cleaningMaterial.update({
        where: { id: materialId },
        data: {
          currentStock: toDecimal(nextStock),
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          targetType: StockTargetType.CLEANING_MATERIAL,
          direction: appliedAmount > 0 ? StockDirection.IN : StockDirection.OUT,
          reason: StockMovementReason.MANUAL,
          isManual: true,
          quantity: toDecimal(Math.abs(appliedAmount)),
          unitCost: current.cost,
          totalCost: toDecimal(Math.abs(appliedAmount) * toNumber(current.cost)),
          sessionId: resolvedSession.id,
          cleaningMaterialId: materialId,
          note: note || null,
          createdByUserId: context?.actorUserId,
        },
      });

      await new AuditService(tx).log(
        {
          entityName: 'stock_movements',
          entityId: movement.id,
          action: 'CLEANING_MATERIAL_MANUAL_MOVEMENT_CREATED',
          metadata: {
            materialId,
            requestedAmount,
            appliedAmount,
            previousStock: currentStock,
            nextStock,
          },
        },
        context
      );

      return {
        updated,
        movement,
        requestedAmount,
        appliedAmount,
      };
    });

    return result;
  }
}
