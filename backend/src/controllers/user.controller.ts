import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';

import { UserService } from '../services/user.service.js';
import { userCreateSchema } from '../validators/user.validator.js';

const userService = new UserService();

const toUserRole = (value: 'ADMIN' | 'OPERATOR' | 'AUDITOR'): UserRole => {
  if (value === 'ADMIN') return UserRole.ADMIN;
  if (value === 'AUDITOR') return UserRole.AUDITOR;
  return UserRole.OPERATOR;
};

export const userController = {
  list: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const includeInactive = req.query.includeInactive !== 'false';
    const users = await userService.list(actorUserId, includeInactive);
    res.status(200).json(users);
  },

  create: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = userCreateSchema.parse(req.body);
    const created = await userService.create(actorUserId, {
      email: payload.email,
      password: payload.password,
      name: payload.name,
      role: toUserRole(payload.role),
      isActive: payload.isActive,
    });

    res.status(201).json(created);
  },
};

