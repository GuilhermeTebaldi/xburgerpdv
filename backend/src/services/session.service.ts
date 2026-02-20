import { Prisma, SessionStatus } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import type { RequestContext } from '../types/request-context.js';
import { HttpError } from '../utils/http-error.js';
import { AuditService } from './audit.service.js';

export class SessionService {
  async getCurrentSession() {
    let session = await prisma.operatingSession.findFirst({
      where: { status: SessionStatus.OPEN },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      session = await prisma.operatingSession.create({
        data: {
          status: SessionStatus.OPEN,
        },
      });
    }

    return session;
  }

  async closeCurrentSession(nextSession: boolean, context?: RequestContext) {
    const current = await this.getCurrentSession();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const closed = await tx.operatingSession.update({
        where: { id: current.id },
        data: {
          status: SessionStatus.CLOSED,
          endedAt: new Date(),
          closedByUserId: context?.actorUserId,
        },
      });

      const newSession = nextSession
        ? await tx.operatingSession.create({
            data: {
              status: SessionStatus.OPEN,
              openedByUserId: context?.actorUserId,
            },
          })
        : null;

      const audit = new AuditService(tx);
      await audit.log(
        {
          entityName: 'operating_sessions',
          entityId: closed.id,
          action: 'SESSION_CLOSED',
          afterData: {
            nextSessionId: newSession?.id || null,
          },
        },
        context
      );

      if (newSession) {
        await audit.log(
          {
            entityName: 'operating_sessions',
            entityId: newSession.id,
            action: 'SESSION_OPENED',
          },
          context
        );
      }

      return { closed, newSession };
    });

    return result;
  }

  async getSessionById(sessionId: string) {
    const session = await prisma.operatingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new HttpError(404, 'Sessão não encontrada.');
    }
    return session;
  }
}
