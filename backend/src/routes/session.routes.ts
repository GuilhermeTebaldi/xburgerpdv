import { Router } from 'express';

import { sessionController } from '../controllers/session.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const sessionRouter = Router();

sessionRouter.get('/current', authRequired, asyncHandler(sessionController.current));
sessionRouter.post('/current/close', authRequired, asyncHandler(sessionController.closeCurrent));
