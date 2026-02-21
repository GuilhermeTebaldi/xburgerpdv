import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(200);
const quantitySchema = z.coerce.number().finite();
const positiveQuantitySchema = quantitySchema.gt(0);

const recipeItemSchema = z.object({
  ingredientId: idSchema,
  quantity: positiveQuantitySchema,
});

const comboItemSchema = z.object({
  productId: idSchema,
  quantity: z.coerce.number().int().positive(),
});

const ingredientSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(50),
  currentStock: z.coerce.number().finite().min(0),
  minStock: z.coerce.number().finite().min(0),
  cost: z.coerce.number().finite().min(0),
  autoReplenishEnabled: z.boolean().optional(),
  autoReplenishQuantity: z.coerce.number().finite().min(0).optional(),
  imageUrl: z.string().trim().max(1024).optional(),
  addonPrice: z.coerce.number().finite().min(0).optional(),
  icon: z.string().trim().max(200).optional(),
});

const productSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(200),
  price: z.coerce.number().finite().min(0),
  imageUrl: z.string().trim().min(1).max(1024),
  category: z.enum(['Snack', 'Drink', 'Side', 'Combo']),
  recipe: z.array(recipeItemSchema).min(1),
  comboItems: z.array(comboItemSchema).optional(),
});

const cleaningMaterialSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(50),
  currentStock: z.coerce.number().finite().min(0),
  minStock: z.coerce.number().finite().min(0),
  cost: z.coerce.number().finite().min(0),
  imageUrl: z.string().trim().max(1024).optional(),
});

const baseCommandSchema = z.object({
  commandId: idSchema.optional(),
});

const saleRegisterCommandSchema = baseCommandSchema.extend({
  type: z.literal('SALE_REGISTER'),
  productId: idSchema,
  recipeOverride: z.array(recipeItemSchema).min(1).optional(),
  priceOverride: z.coerce.number().finite().min(0).optional(),
});

const saleUndoCommandSchema = baseCommandSchema.extend({
  type: z.literal('SALE_UNDO_LAST'),
});

const ingredientStockMoveCommandSchema = baseCommandSchema.extend({
  type: z.literal('INGREDIENT_STOCK_MOVE'),
  ingredientId: idSchema,
  amount: quantitySchema.refine((value) => value !== 0, 'amount não pode ser zero'),
});

const ingredientCreateCommandSchema = baseCommandSchema.extend({
  type: z.literal('INGREDIENT_CREATE'),
  ingredient: ingredientSchema,
});

const ingredientUpdateCommandSchema = baseCommandSchema.extend({
  type: z.literal('INGREDIENT_UPDATE'),
  ingredient: ingredientSchema,
});

const ingredientDeleteCommandSchema = baseCommandSchema.extend({
  type: z.literal('INGREDIENT_DELETE'),
  ingredientId: idSchema,
});

const productCreateCommandSchema = baseCommandSchema.extend({
  type: z.literal('PRODUCT_CREATE'),
  product: productSchema,
});

const productUpdateCommandSchema = baseCommandSchema.extend({
  type: z.literal('PRODUCT_UPDATE'),
  product: productSchema,
});

const productDeleteCommandSchema = baseCommandSchema.extend({
  type: z.literal('PRODUCT_DELETE'),
  productId: idSchema,
});

const cleaningMaterialCreateCommandSchema = baseCommandSchema.extend({
  type: z.literal('CLEANING_MATERIAL_CREATE'),
  material: cleaningMaterialSchema,
});

const cleaningMaterialUpdateCommandSchema = baseCommandSchema.extend({
  type: z.literal('CLEANING_MATERIAL_UPDATE'),
  material: cleaningMaterialSchema,
});

const cleaningMaterialDeleteCommandSchema = baseCommandSchema.extend({
  type: z.literal('CLEANING_MATERIAL_DELETE'),
  materialId: idSchema,
});

const cleaningStockMoveCommandSchema = baseCommandSchema.extend({
  type: z.literal('CLEANING_STOCK_MOVE'),
  materialId: idSchema,
  amount: quantitySchema.refine((value) => value !== 0, 'amount não pode ser zero'),
});

const clearHistoryCommandSchema = baseCommandSchema.extend({
  type: z.literal('CLEAR_HISTORY'),
});

const factoryResetCommandSchema = baseCommandSchema.extend({
  type: z.literal('FACTORY_RESET'),
});

const clearOperationalDataCommandSchema = baseCommandSchema.extend({
  type: z.literal('CLEAR_OPERATIONAL_DATA'),
});

const clearOnlyStockCommandSchema = baseCommandSchema.extend({
  type: z.literal('CLEAR_ONLY_STOCK'),
});

const deleteArchiveSalesCommandSchema = baseCommandSchema.extend({
  type: z.literal('DELETE_ARCHIVE_SALES'),
  saleIds: z.array(idSchema).min(1),
});

export const stateCommandSchema = z.discriminatedUnion('type', [
  saleRegisterCommandSchema,
  saleUndoCommandSchema,
  ingredientStockMoveCommandSchema,
  ingredientCreateCommandSchema,
  ingredientUpdateCommandSchema,
  ingredientDeleteCommandSchema,
  productCreateCommandSchema,
  productUpdateCommandSchema,
  productDeleteCommandSchema,
  cleaningMaterialCreateCommandSchema,
  cleaningMaterialUpdateCommandSchema,
  cleaningMaterialDeleteCommandSchema,
  cleaningStockMoveCommandSchema,
  clearHistoryCommandSchema,
  factoryResetCommandSchema,
  clearOperationalDataCommandSchema,
  clearOnlyStockCommandSchema,
  deleteArchiveSalesCommandSchema,
]);

export type StateCommandInput = z.infer<typeof stateCommandSchema>;
