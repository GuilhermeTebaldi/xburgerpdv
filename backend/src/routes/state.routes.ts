import { Router } from 'express';

import { stateController } from '../controllers/state.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const appStateRouter = Router();

appStateRouter.get('/', asyncHandler(stateController.getState));
