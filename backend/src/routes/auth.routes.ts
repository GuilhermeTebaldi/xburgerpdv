import { Router } from 'express';

import { authController } from '../controllers/auth.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

authRouter.post('/login', asyncHandler(authController.login));
authRouter.get('/me', authRequired, asyncHandler(authController.me));
