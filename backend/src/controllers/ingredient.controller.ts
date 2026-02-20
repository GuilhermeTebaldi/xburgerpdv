import type { Request, Response } from 'express';

import { StockTargetType } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { IngredientService } from '../services/ingredient.service.js';
import { toFrontIngredient, toFrontIngredientEntry } from '../services/mappers.service.js';
import {
  ingredientCreateSchema,
  ingredientMovementSchema,
  ingredientUpdateSchema,
} from '../validators/ingredient.validator.js';

const ingredientService = new IngredientService();

export const ingredientController = {
  list: async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === 'true';
    const items = await ingredientService.list(includeInactive);
    res.status(200).json(items.map(toFrontIngredient));
  },

  getById: async (req: Request, res: Response) => {
    const ingredient = await ingredientService.getById(req.params.id);
    res.status(200).json(toFrontIngredient(ingredient));
  },

  create: async (req: Request, res: Response) => {
    const payload = ingredientCreateSchema.parse(req.body);
    const created = await ingredientService.create(payload, req.context);
    res.status(201).json(toFrontIngredient(created));
  },

  update: async (req: Request, res: Response) => {
    const payload = ingredientUpdateSchema.parse(req.body);
    const updated = await ingredientService.update(req.params.id, payload, req.context);
    res.status(200).json(toFrontIngredient(updated));
  },

  remove: async (req: Request, res: Response) => {
    await ingredientService.remove(req.params.id, req.context);
    res.status(204).send();
  },

  manualMovement: async (req: Request, res: Response) => {
    const payload = ingredientMovementSchema.parse(req.body);
    const result = await ingredientService.addManualMovement(
      req.params.id,
      payload.amount,
      payload.note,
      payload.sessionId,
      req.context
    );

    const movementWithIngredient = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: result.movement.id },
      include: {
        ingredient: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({
      movement: toFrontIngredientEntry(movementWithIngredient),
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
        targetType: StockTargetType.INGREDIENT,
        sessionId,
        isManual: mode === 'manual' ? true : undefined,
      },
      include: {
        ingredient: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json(movements.map(toFrontIngredientEntry));
  },
};
