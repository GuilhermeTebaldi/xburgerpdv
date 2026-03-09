import { Router } from 'express';

import { cleaningMaterialController } from '../controllers/cleaning-material.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const cleaningMaterialRouter = Router();

cleaningMaterialRouter.get('/', authRequired, asyncHandler(cleaningMaterialController.list));
cleaningMaterialRouter.get('/movements', authRequired, asyncHandler(cleaningMaterialController.listMovements));
cleaningMaterialRouter.get('/:id', authRequired, asyncHandler(cleaningMaterialController.getById));
cleaningMaterialRouter.post('/', authRequired, asyncHandler(cleaningMaterialController.create));
cleaningMaterialRouter.patch('/:id', authRequired, asyncHandler(cleaningMaterialController.update));
cleaningMaterialRouter.delete('/:id', authRequired, asyncHandler(cleaningMaterialController.remove));
cleaningMaterialRouter.post(
  '/:id/movements',
  authRequired,
  asyncHandler(cleaningMaterialController.manualMovement)
);
