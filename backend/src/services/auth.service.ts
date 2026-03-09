import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions, Secret } from 'jsonwebtoken';

import { getAuthEnv } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http-error.js';

const ADMIN_GERAL_EMAIL = 'xburger.admin@geral.com';

export class AuthService {
  async login(email: string, password: string) {
    const authEnv = getAuthEnv();
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }
    const isAdminGeral = user.email.trim().toLowerCase() === ADMIN_GERAL_EMAIL;
    if (user.billingBlocked && !isAdminGeral) {
      throw new HttpError(402, 'Empresa bloqueada por inadimplência. Regularize o pagamento para liberar o acesso.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }

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
      },
    });

    if (!user || !user.isActive) {
      throw new HttpError(401, 'Usuário autenticado não encontrado.');
    }
    const isAdminGeral = user.email.trim().toLowerCase() === ADMIN_GERAL_EMAIL;
    if (user.billingBlocked && !isAdminGeral) {
      throw new HttpError(402, 'Empresa bloqueada por inadimplência. Regularize o pagamento para liberar o acesso.');
    }

    return user;
  }
}
