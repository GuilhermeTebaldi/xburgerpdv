import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';

import { UserService } from '../services/user.service.js';
import {
  companyBillingSchema,
  companyLayoutThemeSchema,
  companyPurgeSchema,
  companyUsersLinkSchema,
  companyStatusSchema,
  companyUsersCreateSchema,
  userCreateSchema,
} from '../validators/user.validator.js';

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

  createCompanyUsers: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = companyUsersCreateSchema.parse(req.body);
    const created = await userService.createCompanyUsers(actorUserId, {
      companyName: payload.companyName,
      manager: {
        email: payload.manager.email,
        password: payload.manager.password,
        name: payload.manager.name,
      },
      operator: {
        email: payload.operator.email,
        password: payload.operator.password,
        name: payload.operator.name,
      },
      isActive: payload.isActive,
    });

    res.status(201).json(created);
  },

  setCompanyBilling: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = companyBillingSchema.parse(req.body);
    await userService.setCompanyBilling(actorUserId, {
      stateOwnerUserId: req.params.stateOwnerUserId,
      blocked: payload.blocked,
      message: payload.message,
      blockedDays: payload.blockedDays,
    });

    res.status(204).send();
  },

  setCompanyStatus: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = companyStatusSchema.parse(req.body);
    await userService.setCompanyStatus(actorUserId, {
      stateOwnerUserId: req.params.stateOwnerUserId,
      isActive: payload.isActive,
    });

    res.status(204).send();
  },

  setCompanyLayoutTheme: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = companyLayoutThemeSchema.parse(req.body);
    const result = await userService.setCompanyLayoutTheme(actorUserId, {
      stateOwnerUserId: req.params.stateOwnerUserId,
      layoutThemeId: payload.layoutThemeId,
    });

    res.status(200).json(result);
  },

  linkExistingCompanyUsers: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = companyUsersLinkSchema.parse(req.body);
    const result = await userService.linkExistingCompanyUsers(actorUserId, {
      companyName: payload.companyName,
      managerEmail: payload.managerEmail,
      operatorEmail: payload.operatorEmail,
    });

    res.status(200).json(result);
  },

  deleteCompanyPermanently: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const payload = companyPurgeSchema.parse(req.body);
    const result = await userService.deleteCompanyPermanently(actorUserId, {
      stateOwnerUserId: req.params.stateOwnerUserId,
      firstConfirmation: payload.firstConfirmation,
      secondConfirmation: payload.secondConfirmation,
    });

    res.status(200).json(result);
  },
};
