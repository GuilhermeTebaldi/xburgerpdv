import { Router } from 'express';

import { userController } from '../controllers/user.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const userRouter = Router();

userRouter.get('/', authRequired, asyncHandler(userController.list));
userRouter.post('/', authRequired, asyncHandler(userController.create));
userRouter.post('/company', authRequired, asyncHandler(userController.createCompanyUsers));
