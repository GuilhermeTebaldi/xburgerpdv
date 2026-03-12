import { Router } from 'express';

import { printPreferencesController } from '../controllers/print-preferences.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const printPreferencesRouter = Router();

printPreferencesRouter.get('/', authRequired, asyncHandler(printPreferencesController.getMine));
printPreferencesRouter.put('/', authRequired, asyncHandler(printPreferencesController.upsertMine));
