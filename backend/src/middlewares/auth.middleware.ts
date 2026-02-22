import type { NextFunction, Request, Response } from 'express';

import jwt from 'jsonwebtoken';

import { getAuthEnv } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

interface TokenPayload {
  sub: string;
  role: string;
}

export const decodeBearerUserId = (header: string | undefined): string | null => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Formato de token inválido. Use Bearer <token>.');
  }

  const authEnv = getAuthEnv();

  try {
    const payload = jwt.verify(token, authEnv.JWT_SECRET) as TokenPayload;
    return payload.sub;
  } catch {
    throw new HttpError(401, 'Token inválido ou expirado.');
  }
};

export const authRequired = (req: Request, _res: Response, next: NextFunction) => {
  const userId = decodeBearerUserId(req.header('authorization'));
  if (!userId) {
    throw new HttpError(401, 'Token de autenticação não informado.');
  }

  req.authUserId = userId;
  if (!req.context.actorUserId) {
    req.context.actorUserId = userId;
  }
  next();
};
