import type { Request, Response } from 'express';

import { ProductCategory } from '@prisma/client';

import { ProductService } from '../services/product.service.js';
import { toFrontProduct } from '../services/mappers.service.js';
import { productCreateSchema, productUpdateSchema } from '../validators/product.validator.js';

const productService = new ProductService();

const toCategory = (category: 'SNACK' | 'DRINK' | 'SIDE') => {
  if (category === 'SNACK') return ProductCategory.SNACK;
  if (category === 'DRINK') return ProductCategory.DRINK;
  return ProductCategory.SIDE;
};

export const productController = {
  list: async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === 'true';
    const products = await productService.list(includeInactive);
    res.status(200).json(products.map(toFrontProduct));
  },

  getById: async (req: Request, res: Response) => {
    const product = await productService.getById(req.params.id);
    res.status(200).json(toFrontProduct(product));
  },

  create: async (req: Request, res: Response) => {
    const payload = productCreateSchema.parse(req.body);
    const created = await productService.create(
      {
        ...payload,
        category: toCategory(payload.category),
      },
      req.context
    );
    res.status(201).json(toFrontProduct(created));
  },

  update: async (req: Request, res: Response) => {
    const payload = productUpdateSchema.parse(req.body);
    const updated = await productService.update(
      req.params.id,
      {
        ...payload,
        category: payload.category ? toCategory(payload.category) : undefined,
      },
      req.context
    );
    res.status(200).json(toFrontProduct(updated));
  },

  remove: async (req: Request, res: Response) => {
    await productService.remove(req.params.id, req.context);
    res.status(204).send();
  },
};
