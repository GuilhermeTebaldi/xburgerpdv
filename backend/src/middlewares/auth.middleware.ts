import type { NextFunction, Request, Response } from 'express';

import jwt from 'jsonwebtoken';

import { getAuthEnv } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { toBillingBlockErrorDetails, resolveBillingBlockSnapshot } from '../services/billing-block.service.js';
import { HttpError } from '../utils/http-error.js';

interface TokenPayload {
  sub: string;
  role: string;
}

const ADMIN_GERAL_EMAIL = 'xburger.admin@geral.com';

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

export const assertUserAccessAllowed = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      billingBlocked: true,
      billingBlockedMessage: true,
      billingBlockedUntil: true,
    },
  });

  if (!user || !user.isActive) {
    throw new HttpError(401, 'Usuário não autenticado.');
  }

  const isAdminGeral = user.email.trim().toLowerCase() === ADMIN_GERAL_EMAIL;
  const billingBlock = resolveBillingBlockSnapshot(user);
  if (billingBlock.isBlocked && !isAdminGeral) {
    throw new HttpError(
      402,
      billingBlock.message || 'Empresa bloqueada por inadimplência.',
      toBillingBlockErrorDetails(billingBlock)
    );
  }
};

const assertUserSessionAllowed = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new HttpError(401, 'Usuário não autenticado.');
  }
};

export const authRequired = (req: Request, _res: Response, next: NextFunction) => {
  const userId = decodeBearerUserId(req.header('authorization'));
  if (!userId) {
    throw new HttpError(401, 'Token de autenticação não informado.');
  }

  void assertUserAccessAllowed(userId)
    .then(() => {
      req.authUserId = userId;
      if (!req.context.actorUserId) {
        req.context.actorUserId = userId;
      }
      next();
    })
    .catch(next);
};

export const authSessionRequired = (req: Request, _res: Response, next: NextFunction) => {
  const userId = decodeBearerUserId(req.header('authorization'));
  if (!userId) {
    throw new HttpError(401, 'Token de autenticação não informado.');
  }

  void assertUserSessionAllowed(userId)
    .then(() => {
      req.authUserId = userId;
      if (!req.context.actorUserId) {
        req.context.actorUserId = userId;
      }
      next();
    })
    .catch(next);
};
