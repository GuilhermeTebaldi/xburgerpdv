import { Router } from 'express';

import { stateController } from '../controllers/state.controller.js';
import { stateReadAuth, stateWriteAuth } from '../middlewares/state-auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const appStateRouter = Router();

appStateRouter.get('/', stateReadAuth, asyncHandler(stateController.getState));
appStateRouter.put('/', stateWriteAuth, asyncHandler(stateController.putState));
appStateRouter.delete('/', stateWriteAuth, asyncHandler(stateController.clearState));
appStateRouter.post('/commands', stateWriteAuth, asyncHandler(stateController.runCommand));
