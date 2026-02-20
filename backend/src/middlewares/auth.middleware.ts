import type { NextFunction, Request, Response } from 'express';

import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

interface TokenPayload {
  sub: string;
  role: string;
}

export const authRequired = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header) {
    throw new HttpError(401, 'Token de autenticação não informado.');
  }

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Formato de token inválido. Use Bearer <token>.');
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    req.authUserId = payload.sub;
    if (!req.context.actorUserId) {
      req.context.actorUserId = payload.sub;
    }
    next();
  } catch {
    throw new HttpError(401, 'Token inválido ou expirado.');
  }
};
