import type { Request, Response } from 'express';

import { StateService } from '../services/state.service.js';

const stateService = new StateService();

export const stateController = {
  getState: async (_req: Request, res: Response) => {
    const state = await stateService.getAppState();
    res.status(200).json(state);
  },

  putState: async (req: Request, res: Response) => {
    const state = await stateService.saveAppState(req.body, req.context);
    res.status(200).json(state);
  },

  clearState: async (req: Request, res: Response) => {
    const state = await stateService.clearAppState(req.context);
    res.status(200).json(state);
  },
};
