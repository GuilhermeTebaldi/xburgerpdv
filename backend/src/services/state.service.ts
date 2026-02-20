import { SaleStatus, StockTargetType } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import type { FrontAppState } from '../types/frontend.js';
import {
  toFrontCleaningEntry,
  toFrontCleaningMaterial,
  toFrontIngredient,
  toFrontIngredientEntry,
  toFrontProduct,
  toFrontSale,
} from './mappers.service.js';
import { SessionService } from './session.service.js';

export class StateService {
  private readonly sessionService = new SessionService();

  async getAppState(): Promise<FrontAppState> {
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
