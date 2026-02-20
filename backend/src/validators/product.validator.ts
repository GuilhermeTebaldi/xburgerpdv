import { z } from 'zod';

export const productRecipeItemSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.coerce.number().finite().gt(0),
});

export const productCreateSchema = z.object({
  externalId: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(120),
  price: z.coerce.number().finite().min(0),
  imageUrl: z.string().trim().min(1).max(1024),
  category: z.enum(['SNACK', 'DRINK', 'SIDE']),
  recipe: z.array(productRecipeItemSchema).min(1),
});

export const productUpdateSchema = productCreateSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'Informe ao menos um campo para atualização.',
});
