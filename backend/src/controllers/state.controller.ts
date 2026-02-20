import type { Request, Response } from 'express';

import { StateService } from '../services/state.service.js';

const stateService = new StateService();

export const stateController = {
  getState: async (_req: Request, res: Response) => {
    const state = await stateService.getAppState();
    res.status(200).json(state);
  },
};
