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
  if (!userId) {
    throw new HttpError(401, 'Token de autenticação não informado.');
  }

  attachAuthenticatedUser(req, userId);
  next();
};

export const stateWriteAuth = (req: Request, _res: Response, next: NextFunction) => {
  const userId = decodeBearerUserId(req.header('authorization'));
  if (!userId) {
    throw new HttpError(401, 'Token de autenticação não informado.');
  }

  req.stateAuthKind = 'jwt';
  attachAuthenticatedUser(req, userId);

  const stateToken = req.header('x-state-token')?.trim();
  if (!stateToken) {
    next();
    return;
  }

  const payload = verifyStateWriteToken({
    token: stateToken,
  });

  if (!payload.sub) {
    throw new HttpError(401, 'Token de estado sem vínculo de usuário.');
  }
  if (payload.sub !== userId) {
    throw new HttpError(401, 'Token de estado não corresponde ao usuário autenticado.');
  }

  req.stateAuthKind = 'state_token';
  req.stateTokenVersion = payload.ver;
  next();
};
