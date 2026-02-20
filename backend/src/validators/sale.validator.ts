import { z } from 'zod';

import { productRecipeItemSchema } from './product.validator.js';

export const saleCreateItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1),
  priceOverride: z.coerce.number().finite().min(0).optional(),
  recipeOverride: z.array(productRecipeItemSchema).min(1).optional(),
});

export const saleCreateSchema = z.object({
  externalId: z.string().trim().min(1).max(80).optional(),
  sessionId: z.string().uuid().optional(),
  items: z.array(saleCreateItemSchema).min(1),
  note: z.string().trim().max(400).optional(),
});

export const refundCreateSchema = z.object({
  type: z.enum(['FULL', 'PARTIAL']).default('FULL'),
  reason: z.string().trim().max(400).optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .optional(),
}).refine(
  (value) => {
    if (value.type === 'PARTIAL') {
      return Array.isArray(value.items) && value.items.length > 0;
    }
    return true;
  },
  {
    message: 'Para estorno parcial, informe os itens e quantidades.',
    path: ['items'],
  }
);
