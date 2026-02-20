import type { Request, Response } from 'express';

import { AuthService } from '../services/auth.service.js';
import { loginSchema } from '../validators/auth.validator.js';

const authService = new AuthService();

export const authController = {
  login: async (req: Request, res: Response) => {
    const payload = loginSchema.parse(req.body);
    const result = await authService.login(payload.email, payload.password);
    res.status(200).json(result);
  },

  me: async (req: Request, res: Response) => {
    const userId = req.authUserId;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const result = await authService.me(userId);
    res.status(200).json(result);
  },
};
