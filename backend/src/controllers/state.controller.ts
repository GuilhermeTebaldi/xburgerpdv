import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { AsyncStateCommandQueueService } from '../services/async-state-command-queue.service.js';
import { issueStateWriteToken } from '../services/state-auth.service.js';
import { StateService } from '../services/state.service.js';
import { HttpError } from '../utils/http-error.js';
import {
  stateAsyncConfirmPaidEnqueueSchema,
  stateAsyncJobIdParamSchema,
  stateCommandSchema,
} from '../validators/state-command.validator.js';

const stateService = new StateService();
const asyncStateCommandQueueService = new AsyncStateCommandQueueService();

const normalizeVersion = (raw: string): string =>
  raw.trim().replace(/^W\//i, '').replace(/^"(.+)"$/, '$1');

const readIfMatchVersion = (req: Request): string => {
  const header = req.header('if-match');
  if (!header) {
    throw new HttpError(428, 'Cabeçalho If-Match é obrigatório para escrita de estado.');
  }

  const version = normalizeVersion(header);
  if (!version) {
    throw new HttpError(400, 'Cabeçalho If-Match inválido.');
  }
  return version;
};

const setStateHeaders = (req: Request, res: Response, version: string): void => {
  res.setHeader('ETag', `"${version}"`);
  res.setHeader('X-State-Version', version);

  if (req.context.actorUserId) {
    const token = issueStateWriteToken({
      version,
      actorUserId: req.context.actorUserId,
    });
    res.setHeader('X-State-Token', token);
  }
};

const toAsyncJobPayload = (
  job: Awaited<ReturnType<AsyncStateCommandQueueService['getJobForActor']>>
) => ({
  jobId: job.id,
  draftId: job.draftId,
  status: job.status,
  attemptCount: job.attemptCount,
  maxAttempts: job.maxAttempts,
  availableAt: job.availableAt.toISOString(),
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
  finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  lastError: job.lastError,
  lastErrorCode: job.lastErrorCode,
  resultVersion: job.resultVersion,
});

export const stateController = {
  headState: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      throw new HttpError(401, 'Usuário não autenticado.');
    }

    const version = await stateService.getAppStateVersion(actorUserId);
    setStateHeaders(req, res, version);
    res.status(204).end();
  },

  getState: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      throw new HttpError(401, 'Usuário não autenticado.');
    }

    const snapshot = await stateService.getAppState(actorUserId);
    setStateHeaders(req, res, snapshot.version);
    res.status(200).json(snapshot.state);
  },

  putState: async (req: Request, res: Response) => {
    const expectedVersion = readIfMatchVersion(req);
    if (req.stateTokenVersion && req.stateTokenVersion !== expectedVersion) {
      throw new HttpError(412, 'Token de estado desatualizado para a versão informada.', {
        tokenVersion: req.stateTokenVersion,
        expectedVersion,
      });
    }

    const actorUserId = req.authUserId;
    if (!actorUserId) {
      throw new HttpError(401, 'Usuário não autenticado.');
    }

    const snapshot = await stateService.saveAppState(actorUserId, req.body, expectedVersion, req.context);
    setStateHeaders(req, res, snapshot.version);
    res.status(200).json(snapshot.state);
  },

  clearState: async (req: Request, res: Response) => {
    const expectedVersion = readIfMatchVersion(req);
    if (req.stateTokenVersion && req.stateTokenVersion !== expectedVersion) {
      throw new HttpError(412, 'Token de estado desatualizado para a versão informada.', {
        tokenVersion: req.stateTokenVersion,
        expectedVersion,
      });
    }

    const actorUserId = req.authUserId;
    if (!actorUserId) {
      throw new HttpError(401, 'Usuário não autenticado.');
    }

    const snapshot = await stateService.clearAppState(actorUserId, expectedVersion, req.context);
    setStateHeaders(req, res, snapshot.version);
    res.status(200).json(snapshot.state);
  },

  runCommand: async (req: Request, res: Response) => {
    const expectedVersion = readIfMatchVersion(req);
    if (req.stateTokenVersion && req.stateTokenVersion !== expectedVersion) {
      throw new HttpError(412, 'Token de estado desatualizado para a versão informada.', {
        tokenVersion: req.stateTokenVersion,
        expectedVersion,
      });
    }

    const actorUserId = req.authUserId;
    if (!actorUserId) {
      throw new HttpError(401, 'Usuário não autenticado.');
    }

    const command = stateCommandSchema.parse(req.body);
    const snapshot = await stateService.applyCommand(actorUserId, command, expectedVersion, req.context);
    setStateHeaders(req, res, snapshot.version);
    res.status(200).json(snapshot.state);
  },

  enqueueConfirmPaidAsync: async (req: Request, res: Response) => {
    if (req.stateTokenVersion) {
      const ifMatch = req.header('if-match');
      if (ifMatch) {
        const expectedVersion = normalizeVersion(ifMatch);
        if (expectedVersion && req.stateTokenVersion !== expectedVersion) {
          throw new HttpError(412, 'Token de estado desatualizado para a versão informada.', {
            tokenVersion: req.stateTokenVersion,
            expectedVersion,
          });
        }
      }
    }

    const actorUserId = req.authUserId;
    if (!actorUserId) {
      throw new HttpError(401, 'Usuário não autenticado.');
    }

    const payload = stateAsyncConfirmPaidEnqueueSchema.parse(req.body || {});
    try {
      const result = await asyncStateCommandQueueService.enqueueConfirmPaid(
        actorUserId,
        payload,
        req.context
      );
      res.status(202).json({
        mode: 'async_server',
        created: result.created,
        job: toAsyncJobPayload(result.job),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        throw new HttpError(501, 'Fila assíncrona indisponível no servidor.');
      }
      throw error;
    }
  },

  getAsyncJobStatus: async (req: Request, res: Response) => {
    const actorUserId = req.authUserId;
    if (!actorUserId) {
      throw new HttpError(401, 'Usuário não autenticado.');
    }

    const params = stateAsyncJobIdParamSchema.parse(req.params || {});
    try {
      const job = await asyncStateCommandQueueService.getJobForActor(actorUserId, params.jobId);
      res.status(200).json(toAsyncJobPayload(job));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        throw new HttpError(501, 'Fila assíncrona indisponível no servidor.');
      }
      throw error;
    }
  },
};
