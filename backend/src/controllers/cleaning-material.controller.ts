import type { Request, Response } from 'express';

import { StockTargetType } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { CleaningMaterialService } from '../services/cleaning-material.service.js';
import { toFrontCleaningEntry, toFrontCleaningMaterial } from '../services/mappers.service.js';
import {
  cleaningMaterialCreateSchema,
  cleaningMaterialMovementSchema,
  cleaningMaterialUpdateSchema,
} from '../validators/cleaning-material.validator.js';

const cleaningMaterialService = new CleaningMaterialService();

export const cleaningMaterialController = {
  list: async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === 'true';
    const items = await cleaningMaterialService.list(includeInactive);
    res.status(200).json(items.map(toFrontCleaningMaterial));
  },

  getById: async (req: Request, res: Response) => {
    const material = await cleaningMaterialService.getById(req.params.id);
    res.status(200).json(toFrontCleaningMaterial(material));
  },

  create: async (req: Request, res: Response) => {
    const payload = cleaningMaterialCreateSchema.parse(req.body);
    const created = await cleaningMaterialService.create(payload, req.context);
    res.status(201).json(toFrontCleaningMaterial(created));
  },

  update: async (req: Request, res: Response) => {
    const payload = cleaningMaterialUpdateSchema.parse(req.body);
    const updated = await cleaningMaterialService.update(req.params.id, payload, req.context);
    res.status(200).json(toFrontCleaningMaterial(updated));
  },

  remove: async (req: Request, res: Response) => {
    await cleaningMaterialService.remove(req.params.id, req.context);
    res.status(204).send();
  },

  manualMovement: async (req: Request, res: Response) => {
    const payload = cleaningMaterialMovementSchema.parse(req.body);

    const result = await cleaningMaterialService.addManualMovement(
      req.params.id,
      payload.amount,
      payload.note,
      payload.sessionId,
      req.context
    );

    const movementWithMaterial = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: result.movement.id },
      include: {
        cleaningMaterial: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({
      movement: toFrontCleaningEntry(movementWithMaterial),
      requestedAmount: result.requestedAmount,
      appliedAmount: result.appliedAmount,
      currentStock: result.updated.currentStock.toNumber(),
    });
  },

  listMovements: async (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const mode = req.query.mode === 'all' ? 'all' : 'manual';

    const movements = await prisma.stockMovement.findMany({
      where: {
        targetType: StockTargetType.CLEANING_MATERIAL,
        sessionId,
        isManual: mode === 'manual' ? true : undefined,
      },
      include: {
        cleaningMaterial: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json(movements.map(toFrontCleaningEntry));
  },
};
