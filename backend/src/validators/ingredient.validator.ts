import { z } from 'zod';

const quantitySchema = z.coerce.number().finite();

export const ingredientCreateSchema = z.object({
  externalId: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(30),
  currentStock: quantitySchema.min(0),
  minStock: quantitySchema.min(0),
  cost: z.coerce.number().finite().min(0),
  addonPrice: z.coerce.number().finite().min(0).optional(),
  imageUrl: z.string().trim().max(1024).optional(),
});

export const ingredientUpdateSchema = ingredientCreateSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'Informe ao menos um campo para atualização.',
});

export const ingredientMovementSchema = z.object({
  amount: quantitySchema.refine((value) => value !== 0, 'amount não pode ser zero'),
  note: z.string().trim().max(400).optional(),
  sessionId: z.string().uuid().optional(),
});
