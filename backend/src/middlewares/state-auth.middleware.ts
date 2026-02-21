import type { NextFunction, Request, Response } from 'express';

import { decodeBearerUserId } from './auth.middleware.js';
import { verifyStateWriteToken } from '../services/state-auth.service.js';
import { HttpError } from '../utils/http-error.js';

const attachAuthenticatedUser = (req: Request, userId: string) => {
  req.authUserId = userId;
  if (!req.context.actorUserId) {
    req.context.actorUserId = userId;
  }
};

export const stateReadAuth = (req: Request, _res: Response, next: NextFunction) => {
  const userId = decodeBearerUserId(req.header('authorization'));
  if (userId) {
    attachAuthenticatedUser(req, userId);
  }
  next();
};

export const stateWriteAuth = (req: Request, _res: Response, next: NextFunction) => {
  const userId = decodeBearerUserId(req.header('authorization'));
  if (userId) {
    req.stateAuthKind = 'jwt';
    attachAuthenticatedUser(req, userId);
    next();
    return;
  }

  const stateToken = req.header('x-state-token')?.trim();
  if (!stateToken) {
    throw new HttpError(401, 'Autenticação necessária para atualizar o estado.');
  }

  const payload = verifyStateWriteToken({
    token: stateToken,
  });

  req.stateAuthKind = 'state_token';
  req.stateTokenVersion = payload.ver;
  if (payload.sub) {
    attachAuthenticatedUser(req, payload.sub);
  }
  next();
};
