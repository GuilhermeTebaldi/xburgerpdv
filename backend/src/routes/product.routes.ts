import { Router } from 'express';

import { productController } from '../controllers/product.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const productRouter = Router();

productRouter.get('/', asyncHandler(productController.list));
productRouter.get('/:id', asyncHandler(productController.getById));
productRouter.post('/', authRequired, asyncHandler(productController.create));
productRouter.patch('/:id', authRequired, asyncHandler(productController.update));
productRouter.delete('/:id', authRequired, asyncHandler(productController.remove));
