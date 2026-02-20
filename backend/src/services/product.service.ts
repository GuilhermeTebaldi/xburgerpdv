import { Prisma, ProductCategory, type Product } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import type { RequestContext } from '../types/request-context.js';
import { toDecimal } from '../utils/decimal.js';
import { HttpError } from '../utils/http-error.js';
import { AuditService } from './audit.service.js';

interface ProductRecipeInput {
  ingredientId: string;
  quantity: number;
}

interface UpsertProductInput {
  externalId?: string;
  name?: string;
  price?: number;
  imageUrl?: string;
  category?: ProductCategory;
  recipe?: ProductRecipeInput[];
}

const normalizeRecipe = (recipe: ProductRecipeInput[]): ProductRecipeInput[] => {
  const map = new Map<string, number>();
  recipe.forEach((item) => {
    const current = map.get(item.ingredientId) || 0;
    map.set(item.ingredientId, current + item.quantity);
  });

  return [...map.entries()].map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
};

export class ProductService {
  async list(includeInactive = false) {
    return prisma.product.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        recipeItems: {
          orderBy: { ingredientId: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        recipeItems: {
          orderBy: { ingredientId: 'asc' },
        },
      },
    });

    if (!product) {
      throw new HttpError(404, 'Produto não encontrado.');
    }

    return product;
  }

  private async assertRecipeIngredientsExist(
    recipe: ProductRecipeInput[],
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const ingredientIds = [...new Set(recipe.map((item) => item.ingredientId))];
    const found = await tx.ingredient.findMany({
      where: {
        id: { in: ingredientIds },
        isActive: true,
      },
      select: { id: true },
    });

    if (found.length !== ingredientIds.length) {
      const foundIds = new Set(found.map((ingredient) => ingredient.id));
      const missingIds = ingredientIds.filter((id) => !foundIds.has(id));
      throw new HttpError(422, 'Receita contém insumos inexistentes ou inativos.', { missingIds });
    }
  }

  async create(input: UpsertProductInput, context?: RequestContext) {
    const recipe = normalizeRecipe(input.recipe || []);
    if (recipe.length === 0) {
      throw new HttpError(422, 'Produto precisa ter receita com ao menos 1 insumo.');
    }

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.assertRecipeIngredientsExist(recipe, tx);

      const product = await tx.product.create({
        data: {
          externalId: input.externalId,
          name: input.name as string,
          price: toDecimal(input.price ?? 0),
          imageUrl: input.imageUrl as string,
          category: input.category as ProductCategory,
          recipeItems: {
            createMany: {
              data: recipe.map((item) => ({
                ingredientId: item.ingredientId,
                quantity: toDecimal(item.quantity),
              })),
            },
          },
        },
        include: {
          recipeItems: {
            orderBy: { ingredientId: 'asc' },
          },
        },
      });

      await new AuditService(tx).log(
        {
          entityName: 'products',
          entityId: product.id,
          action: 'PRODUCT_CREATED',
          afterData: {
            name: product.name,
            category: product.category,
            price: product.price.toNumber(),
            recipe: recipe.map((item) => ({
              ingredientId: item.ingredientId,
              quantity: item.quantity,
            })),
          },
        },
        context
      );

      return product;
    });

    return created;
  }

  async update(id: string, input: UpsertProductInput, context?: RequestContext) {
    const existing = await this.getById(id);
    const normalizedRecipe = input.recipe ? normalizeRecipe(input.recipe) : undefined;

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (normalizedRecipe) {
        await this.assertRecipeIngredientsExist(normalizedRecipe, tx);
      }

      const product = await tx.product.update({
        where: { id },
        data: {
          externalId: input.externalId,
          name: input.name,
          price: input.price !== undefined ? toDecimal(input.price) : undefined,
          imageUrl: input.imageUrl,
          category: input.category,
        },
      });

      if (normalizedRecipe) {
        await tx.productIngredient.deleteMany({ where: { productId: id } });
        if (normalizedRecipe.length > 0) {
          await tx.productIngredient.createMany({
            data: normalizedRecipe.map((item) => ({
              productId: id,
              ingredientId: item.ingredientId,
              quantity: toDecimal(item.quantity),
            })),
          });
        }
      }

      const withRecipe = await tx.product.findUniqueOrThrow({
        where: { id },
        include: {
          recipeItems: {
            orderBy: { ingredientId: 'asc' },
          },
        },
      });

      await new AuditService(tx).log(
        {
          entityName: 'products',
          entityId: withRecipe.id,
          action: 'PRODUCT_UPDATED',
          beforeData: {
            name: existing.name,
            category: existing.category,
            price: existing.price.toNumber(),
          },
          afterData: {
            name: withRecipe.name,
            category: withRecipe.category,
            price: withRecipe.price.toNumber(),
            recipe: withRecipe.recipeItems.map((item) => ({
              ingredientId: item.ingredientId,
              quantity: item.quantity.toNumber(),
            })),
          },
        },
        context
      );

      return withRecipe;
    });

    return updated;
  }

  async remove(id: string, context?: RequestContext): Promise<void> {
    await this.getById(id);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.product.update({
        where: { id },
        data: { isActive: false },
      });

      await new AuditService(tx).log(
        {
          entityName: 'products',
          entityId: id,
          action: 'PRODUCT_DEACTIVATED',
        },
        context
      );
    });
  }

  async ensureProductExists(id: string): Promise<Product> {
    const product = await prisma.product.findFirst({
      where: { id, isActive: true },
    });

    if (!product) {
      throw new HttpError(404, 'Produto não encontrado ou inativo.');
    }

    return product;
  }
}
