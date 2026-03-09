import { Router } from 'express';

import { ingredientController } from '../controllers/ingredient.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const ingredientRouter = Router();

ingredientRouter.get('/', authRequired, asyncHandler(ingredientController.list));
ingredientRouter.get('/movements', authRequired, asyncHandler(ingredientController.listMovements));
ingredientRouter.get('/:id', authRequired, asyncHandler(ingredientController.getById));
ingredientRouter.post('/', authRequired, asyncHandler(ingredientController.create));
ingredientRouter.patch('/:id', authRequired, asyncHandler(ingredientController.update));
ingredientRouter.delete('/:id', authRequired, asyncHandler(ingredientController.remove));
ingredientRouter.post('/:id/movements', authRequired, asyncHandler(ingredientController.manualMovement));
