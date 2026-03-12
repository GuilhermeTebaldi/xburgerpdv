import type { Request, Response } from 'express';

import { PrintPreferencesService } from '../services/print-preferences.service.js';
import { printPreferencesUpdateSchema } from '../validators/print-preferences.validator.js';

const printPreferencesService = new PrintPreferencesService();

export const printPreferencesController = {
  getMine: async (req: Request, res: Response) => {
    const userId = req.authUserId;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const result = await printPreferencesService.getByUserId(userId);
    res.status(200).json(result);
  },

  upsertMine: async (req: Request, res: Response) => {
    const userId = req.authUserId;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = printPreferencesUpdateSchema.parse(req.body || {});
    const result = await printPreferencesService.updateByUserId(userId, payload);
    res.status(200).json(result);
  },
};
