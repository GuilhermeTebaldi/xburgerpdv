import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions, Secret } from 'jsonwebtoken';

import { getAuthEnv } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { resolveBillingBlockSnapshot } from './billing-block.service.js';
import { HttpError } from '../utils/http-error.js';

export class AuthService {
  async login(email: string, password: string) {
    const authEnv = getAuthEnv();
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }

    const billingBlock = resolveBillingBlockSnapshot(user);

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      authEnv.JWT_SECRET as Secret,
      {
        expiresIn: authEnv.JWT_EXPIRES_IN as SignOptions['expiresIn'],
      }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        billingBlocked: billingBlock.isBlocked,
        billingBlockedMessage: billingBlock.message,
        billingBlockedUntil: billingBlock.blockedUntil,
        billingBlockedDaysRemaining: billingBlock.daysRemaining,
      },
    };
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        billingBlocked: true,
        billingBlockedMessage: true,
        billingBlockedUntil: true,
      },
    });

    if (!user || !user.isActive) {
      throw new HttpError(401, 'Usuário autenticado não encontrado.');
    }

    const billingBlock = resolveBillingBlockSnapshot(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      billingBlocked: billingBlock.isBlocked,
      billingBlockedMessage: billingBlock.message,
      billingBlockedUntil: billingBlock.blockedUntil,
      billingBlockedDaysRemaining: billingBlock.daysRemaining,
    };
  }
}
