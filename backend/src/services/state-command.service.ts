import type {
  FrontAppState,
  FrontCleaningMaterial,
  FrontCleaningStockEntry,
  FrontIngredient,
  FrontProduct,
  FrontRecipeItem,
  FrontSale,
  FrontStockEntry,
} from '../types/frontend.js';
import type { StateCommandInput } from '../validators/state-command.validator.js';
import { HttpError } from '../utils/http-error.js';

const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toTimestampIso = (value?: Date | string): string => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Timestamp inválido para operação de estado.');
  }
  return date.toISOString();
};

const aggregateRecipe = (recipe: FrontRecipeItem[] = []): Record<string, number> => {
  return recipe.reduce<Record<string, number>>((acc, item) => {
    if (!item?.ingredientId) return acc;
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return acc;
    acc[item.ingredientId] = (acc[item.ingredientId] || 0) + qty;
    return acc;
  }, {});
};

const calculateRecipeCost = (
  ingredients: FrontIngredient[],
  recipe: FrontRecipeItem[]
): { totalCost: number; missingIngredientIds: string[]; totals: Record<string, number> } => {
  const totals = aggregateRecipe(recipe);
  let totalCost = 0;
  const missingIngredientIds: string[] = [];

  Object.entries(totals).forEach(([ingredientId, quantity]) => {
    const ingredient = ingredients.find((entry) => entry.id === ingredientId);
    if (!ingredient) {
      missingIngredientIds.push(ingredientId);
      return;
    }
    totalCost += ingredient.cost * quantity;
  });

  return { totalCost, missingIngredientIds, totals };
};

const getAppliedStockDelta = (currentStock: number, requestedAmount: number): number => {
  if (!Number.isFinite(currentStock) || !Number.isFinite(requestedAmount) || requestedAmount === 0) {
    return 0;
  }

  const normalizedAmount = requestedAmount < 0 ? Math.max(requestedAmount, -currentStock) : requestedAmount;
  if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
    return 0;
  }

  return Math.max(0, currentStock + normalizedAmount) - currentStock;
};

const cloneRecipe = (recipe: FrontRecipeItem[] | undefined): FrontRecipeItem[] | undefined =>
  recipe?.map((item) => ({
    ingredientId: item.ingredientId,
    quantity: item.quantity,
  }));

const cloneSale = (sale: FrontSale): FrontSale => ({
  ...sale,
  recipe: cloneRecipe(sale.recipe),
  stockDebited: cloneRecipe(sale.stockDebited),
});

const cloneState = (state: FrontAppState): FrontAppState => ({
  ingredients: state.ingredients.map((ingredient) => ({ ...ingredient })),
  products: state.products.map((product) => ({
    ...product,
    recipe: cloneRecipe(product.recipe) || [],
    comboItems: product.comboItems?.map((item) => ({ ...item })),
  })),
  sales: state.sales.map(cloneSale),
  stockEntries: state.stockEntries.map((entry) => ({ ...entry })),
  cleaningMaterials: state.cleaningMaterials.map((material) => ({ ...material })),
  cleaningStockEntries: state.cleaningStockEntries.map((entry) => ({ ...entry })),
  globalSales: state.globalSales.map(cloneSale),
  globalCancelledSales: state.globalCancelledSales.map(cloneSale),
  globalStockEntries: state.globalStockEntries.map((entry) => ({ ...entry })),
  globalCleaningStockEntries: state.globalCleaningStockEntries.map((entry) => ({ ...entry })),
});

const emptyAppState = (): FrontAppState => ({
  ingredients: [],
  products: [],
  sales: [],
  stockEntries: [],
  cleaningMaterials: [],
  cleaningStockEntries: [],
  globalSales: [],
  globalCancelledSales: [],
  globalStockEntries: [],
  globalCleaningStockEntries: [],
});

const requireIngredient = (state: FrontAppState, ingredientId: string): FrontIngredient => {
  const ingredient = state.ingredients.find((entry) => entry.id === ingredientId);
  if (!ingredient) {
    throw new HttpError(404, 'Insumo não encontrado para operação.');
  }
  return ingredient;
};

const requireMaterial = (state: FrontAppState, materialId: string): FrontCleaningMaterial => {
  const material = state.cleaningMaterials.find((entry) => entry.id === materialId);
  if (!material) {
    throw new HttpError(404, 'Material de limpeza não encontrado para operação.');
  }
  return material;
};

const pushIngredientMovement = (
  state: FrontAppState,
  entry: FrontStockEntry
): void => {
  state.stockEntries.push(entry);
  state.globalStockEntries.push({ ...entry });
};

const pushCleaningMovement = (
  state: FrontAppState,
  entry: FrontCleaningStockEntry
): void => {
  state.cleaningStockEntries.push(entry);
  state.globalCleaningStockEntries.push({ ...entry });
};

const applySaleRegister = (state: FrontAppState, command: Extract<StateCommandInput, { type: 'SALE_REGISTER' }>) => {
  if (command.clientSaleId) {
    const alreadyRegistered =
      state.sales.some((sale) => sale.id === command.clientSaleId) ||
      state.globalSales.some((sale) => sale.id === command.clientSaleId);
    if (alreadyRegistered) {
      return;
    }
  }

  const product = state.products.find((entry) => entry.id === command.productId);
  if (!product) {
    throw new HttpError(404, 'Produto não encontrado para venda.');
  }

  const recipeToUse = (command.recipeOverride || product.recipe).map((item) => ({
    ingredientId: item.ingredientId,
    quantity: item.quantity,
  }));

  const { totalCost, missingIngredientIds, totals } = calculateRecipeCost(state.ingredients, recipeToUse);
  if (Object.keys(totals).length === 0) {
    throw new HttpError(422, 'Receita inválida. Verifique os ingredientes.');
  }
  if (missingIngredientIds.length > 0) {
    throw new HttpError(422, 'Receita com insumos ausentes.', { missingIngredientIds });
  }

  for (const [ingredientId, requiredQuantity] of Object.entries(totals)) {
    const ingredient = requireIngredient(state, ingredientId);
    if (ingredient.currentStock + Number.EPSILON < requiredQuantity) {
      throw new HttpError(409, `Estoque insuficiente para ${ingredient.name}.`, {
        ingredientId,
        required: requiredQuantity,
        available: ingredient.currentStock,
      });
    }
  }

  const timestamp = toTimestampIso();
  const saleId = command.clientSaleId || createId('s');
  const finalPrice = command.priceOverride !== undefined ? command.priceOverride : product.price;
  const baseCostInfo = calculateRecipeCost(state.ingredients, product.recipe);
  const baseCost = baseCostInfo.missingIngredientIds.length > 0 ? undefined : baseCostInfo.totalCost;
  const stockDebited = Object.entries(totals).map(([ingredientId, quantity]) => ({
    ingredientId,
    quantity,
  }));

  const newSale: FrontSale = {
    id: saleId,
    productId: product.id,
    productName: product.name,
    timestamp,
    total: finalPrice,
    totalCost,
    recipe: recipeToUse,
    stockDebited,
    basePrice: product.price,
    priceAdjustment: finalPrice - product.price,
    baseCost,
  };

  Object.entries(totals).forEach(([ingredientId, quantity]) => {
    state.ingredients = state.ingredients.map((ingredient) =>
      ingredient.id === ingredientId
        ? { ...ingredient, currentStock: Math.max(0, ingredient.currentStock - quantity) }
        : ingredient
    );

    const ingredient = requireIngredient(state, ingredientId);
    const entry: FrontStockEntry = {
      id: `st-sale-${saleId}-${ingredientId}`,
      ingredientId,
      ingredientName: ingredient.name,
      quantity: -quantity,
      unitCost: ingredient.cost,
      timestamp,
      source: 'SALE',
      saleId,
    };
    pushIngredientMovement(state, entry);
  });

  state.sales.push(newSale);
  state.globalSales.push({ ...newSale });
};

const applyUndoLastSale = (state: FrontAppState) => {
  if (state.sales.length === 0) {
    throw new HttpError(404, 'Nenhuma venda para desfazer.');
  }

  const lastSale = state.sales[state.sales.length - 1];
  const recipeToRestore = lastSale.stockDebited || lastSale.recipe;
  const totals = recipeToRestore ? aggregateRecipe(recipeToRestore) : {};
  const autoReplenishmentTotals = state.stockEntries.reduce<Record<string, number>>((acc, entry) => {
    if (entry.saleId !== lastSale.id || entry.source !== 'AUTO_REPLENISH') {
      return acc;
    }
    acc[entry.ingredientId] = (acc[entry.ingredientId] || 0) + entry.quantity;
    return acc;
  }, {});

  if (Object.keys(totals).length > 0 || Object.keys(autoReplenishmentTotals).length > 0) {
    state.ingredients = state.ingredients.map((ingredient) => {
      const restoredQuantity = totals[ingredient.id] || 0;
      const autoReplenished = autoReplenishmentTotals[ingredient.id] || 0;
      if (restoredQuantity === 0 && autoReplenished === 0) return ingredient;
      return {
        ...ingredient,
        currentStock: Math.max(0, ingredient.currentStock + restoredQuantity - autoReplenished),
      };
    });
  }

  state.sales = state.sales.slice(0, -1);
  state.stockEntries = state.stockEntries.filter((entry) => entry.saleId !== lastSale.id);
  state.globalStockEntries = state.globalStockEntries.filter((entry) => entry.saleId !== lastSale.id);

  const globalIndex = state.globalSales.map((sale) => sale.id).lastIndexOf(lastSale.id);
  if (globalIndex >= 0) {
    state.globalSales = state.globalSales.filter((_sale, index) => index !== globalIndex);
  }
  state.globalCancelledSales.push({ ...lastSale });
};

const applyIngredientStockMove = (
  state: FrontAppState,
  command: Extract<StateCommandInput, { type: 'INGREDIENT_STOCK_MOVE' }>
) => {
  const ingredient = requireIngredient(state, command.ingredientId);
  const appliedAmount = getAppliedStockDelta(ingredient.currentStock, command.amount);
  if (appliedAmount === 0) {
    throw new HttpError(409, 'Estoque insuficiente para baixa.');
  }

  const timestamp = toTimestampIso();
  state.ingredients = state.ingredients.map((entry) =>
    entry.id === command.ingredientId
      ? { ...entry, currentStock: Math.max(0, entry.currentStock + appliedAmount) }
      : entry
  );

  const updatedIngredient = requireIngredient(state, command.ingredientId);
  const entry: FrontStockEntry = {
    id: createId('st'),
    ingredientId: command.ingredientId,
    ingredientName: updatedIngredient.name,
    quantity: appliedAmount,
    unitCost: updatedIngredient.cost,
    timestamp,
    source: 'MANUAL',
  };
  pushIngredientMovement(state, entry);
};

const applyCleaningStockMove = (
  state: FrontAppState,
  command: Extract<StateCommandInput, { type: 'CLEANING_STOCK_MOVE' }>
) => {
  const material = requireMaterial(state, command.materialId);
  const appliedAmount = getAppliedStockDelta(material.currentStock, command.amount);
  if (appliedAmount === 0) {
    throw new HttpError(409, 'Estoque de material insuficiente para baixa.');
  }

  const timestamp = toTimestampIso();
  state.cleaningMaterials = state.cleaningMaterials.map((entry) =>
    entry.id === command.materialId
      ? { ...entry, currentStock: Math.max(0, entry.currentStock + appliedAmount) }
      : entry
  );

  const updatedMaterial = requireMaterial(state, command.materialId);
  const entry: FrontCleaningStockEntry = {
    id: createId('cst'),
    materialId: command.materialId,
    materialName: updatedMaterial.name,
    quantity: appliedAmount,
    unitCost: updatedMaterial.cost,
    timestamp,
  };
  pushCleaningMovement(state, entry);
};

const ensureUniqueId = (
  state: FrontAppState,
  field: 'ingredient' | 'product' | 'material',
  id: string
) => {
  if (field === 'ingredient' && state.ingredients.some((entry) => entry.id === id)) {
    throw new HttpError(409, `Já existe um insumo com id ${id}.`);
  }
  if (field === 'product' && state.products.some((entry) => entry.id === id)) {
    throw new HttpError(409, `Já existe um produto com id ${id}.`);
  }
  if (field === 'material' && state.cleaningMaterials.some((entry) => entry.id === id)) {
    throw new HttpError(409, `Já existe um material com id ${id}.`);
  }
};

export const applyStateCommand = (
  currentState: FrontAppState,
  command: StateCommandInput
): FrontAppState => {
  const state = cloneState(currentState);

  switch (command.type) {
    case 'SALE_REGISTER':
      applySaleRegister(state, command);
      return state;
    case 'SALE_UNDO_LAST':
      applyUndoLastSale(state);
      return state;
    case 'INGREDIENT_STOCK_MOVE':
      applyIngredientStockMove(state, command);
      return state;
    case 'INGREDIENT_CREATE':
      ensureUniqueId(state, 'ingredient', command.ingredient.id);
      state.ingredients.push({ ...command.ingredient });
      return state;
    case 'INGREDIENT_UPDATE':
      if (!state.ingredients.some((entry) => entry.id === command.ingredient.id)) {
        throw new HttpError(404, 'Insumo não encontrado para atualização.');
      }
      state.ingredients = state.ingredients.map((entry) =>
        entry.id === command.ingredient.id ? { ...command.ingredient } : entry
      );
      return state;
    case 'INGREDIENT_DELETE':
      if (!state.ingredients.some((entry) => entry.id === command.ingredientId)) {
        throw new HttpError(404, 'Insumo não encontrado para remoção.');
      }
      state.ingredients = state.ingredients.filter((entry) => entry.id !== command.ingredientId);
      state.products = state.products.map((product) => ({
        ...product,
        recipe: product.recipe.filter((item) => item.ingredientId !== command.ingredientId),
      }));
      return state;
    case 'PRODUCT_CREATE':
      ensureUniqueId(state, 'product', command.product.id);
      state.products.push({
        ...command.product,
        recipe: cloneRecipe(command.product.recipe) || [],
        comboItems: command.product.comboItems?.map((item) => ({ ...item })),
      });
      return state;
    case 'PRODUCT_UPDATE':
      if (!state.products.some((entry) => entry.id === command.product.id)) {
        throw new HttpError(404, 'Produto não encontrado para atualização.');
      }
      state.products = state.products.map((entry) =>
        entry.id === command.product.id
          ? {
              ...command.product,
              recipe: cloneRecipe(command.product.recipe) || [],
              comboItems: command.product.comboItems?.map((item) => ({ ...item })),
            }
          : entry
      );
      return state;
    case 'PRODUCT_DELETE':
      if (!state.products.some((entry) => entry.id === command.productId)) {
        throw new HttpError(404, 'Produto não encontrado para remoção.');
      }
      state.products = state.products.filter((entry) => entry.id !== command.productId);
      return state;
    case 'CLEANING_MATERIAL_CREATE':
      ensureUniqueId(state, 'material', command.material.id);
      state.cleaningMaterials.push({ ...command.material });
      return state;
    case 'CLEANING_MATERIAL_UPDATE':
      if (!state.cleaningMaterials.some((entry) => entry.id === command.material.id)) {
        throw new HttpError(404, 'Material de limpeza não encontrado para atualização.');
      }
      state.cleaningMaterials = state.cleaningMaterials.map((entry) =>
        entry.id === command.material.id ? { ...command.material } : entry
      );
      return state;
    case 'CLEANING_MATERIAL_DELETE':
      if (!state.cleaningMaterials.some((entry) => entry.id === command.materialId)) {
        throw new HttpError(404, 'Material de limpeza não encontrado para remoção.');
      }
      state.cleaningMaterials = state.cleaningMaterials.filter(
        (entry) => entry.id !== command.materialId
      );
      return state;
    case 'CLEANING_STOCK_MOVE':
      applyCleaningStockMove(state, command);
      return state;
    case 'CLEAR_HISTORY':
      state.sales = [];
      state.stockEntries = [];
      return state;
    case 'FACTORY_RESET':
      return emptyAppState();
    case 'CLEAR_OPERATIONAL_DATA':
      state.sales = [];
      state.stockEntries = [];
      state.cleaningStockEntries = [];
      state.globalSales = [];
      state.globalCancelledSales = [];
      state.globalStockEntries = [];
      state.globalCleaningStockEntries = [];
      return state;
    case 'CLEAR_ONLY_STOCK':
      state.ingredients = state.ingredients.map((ingredient) => ({ ...ingredient, currentStock: 0 }));
      state.cleaningMaterials = state.cleaningMaterials.map((material) => ({
        ...material,
        currentStock: 0,
      }));
      return state;
    case 'DELETE_ARCHIVE_SALES': {
      const ids = new Set(command.saleIds);
      state.globalSales = state.globalSales.filter((sale) => !ids.has(sale.id));
      return state;
    }
    default: {
      const exhaustiveCheck: never = command;
      throw new HttpError(400, `Comando de estado não suportado: ${String(exhaustiveCheck)}`);
    }
  }
};
