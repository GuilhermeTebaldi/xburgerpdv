import { Router } from 'express';

import { saleController } from '../controllers/sale.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const saleRouter = Router();

saleRouter.get('/', authRequired, asyncHandler(saleController.list));
saleRouter.get('/:id', authRequired, asyncHandler(saleController.getById));
saleRouter.post('/', authRequired, asyncHandler(saleController.create));
saleRouter.post('/undo-last', authRequired, asyncHandler(saleController.undoLast));
saleRouter.post('/:id/refunds', authRequired, asyncHandler(saleController.refund));
