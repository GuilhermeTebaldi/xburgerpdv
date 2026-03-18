import type { NextFunction, Request, Response } from 'express';

import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { HttpError, isHttpError } from '../utils/http-error.js';

const RETRYABLE_DB_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2034']);
const RETRYABLE_DB_MESSAGE_HINTS = [
  'database system is starting up',
  'database system is shutting down',
  'database system is in recovery mode',
  "can't reach database server",
  'failed to connect',
  'connection refused',
  'connect timeout',
  'server closed the connection unexpectedly',
  'terminating connection',
  'too many clients',
  'remaining connection slots',
  'connection reset',
  'timeout',
  'timed out',
];

const normalizeErrorMessage = (value: unknown): string => {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (value instanceof Error) return value.message.trim().toLowerCase();
  return '';
};

const readPrismaCode = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as { code?: unknown; prismaCode?: unknown; details?: unknown };
  const directCandidate =
    typeof source.prismaCode === 'string'
      ? source.prismaCode
      : typeof source.code === 'string'
        ? source.code
        : null;
  if (directCandidate) {
    const normalized = directCandidate.trim().toUpperCase();
    if (normalized) return normalized;
  }

  if (!source.details || typeof source.details !== 'object' || Array.isArray(source.details)) {
    return null;
  }
  const nested = source.details as { prismaCode?: unknown; code?: unknown };
  const nestedCandidate =
    typeof nested.prismaCode === 'string'
      ? nested.prismaCode
      : typeof nested.code === 'string'
        ? nested.code
        : null;
  if (!nestedCandidate) return null;
  const normalizedNested = nestedCandidate.trim().toUpperCase();
  return normalizedNested || null;
};

const hasRetryableDbHint = (value: unknown): boolean => {
  const normalized = normalizeErrorMessage(value);
  if (!normalized) return false;
  return RETRYABLE_DB_MESSAGE_HINTS.some((hint) => normalized.includes(hint));
};

const isDatabaseUnavailableError = (error: unknown): { prismaCode: string | null } | null => {
  const prismaCode = readPrismaCode(error);
  if (prismaCode && RETRYABLE_DB_PRISMA_CODES.has(prismaCode)) {
    return { prismaCode };
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return { prismaCode };
  }

  if (error instanceof HttpError) {
    const detailsCode = readPrismaCode(error.details);
    if (detailsCode && RETRYABLE_DB_PRISMA_CODES.has(detailsCode)) {
      return { prismaCode: detailsCode };
    }
    if (hasRetryableDbHint(error.message) || hasRetryableDbHint(error.details)) {
      return { prismaCode: detailsCode || prismaCode };
    }
  }

  if (error instanceof Error && hasRetryableDbHint(error.message)) {
    return { prismaCode };
  }

  return null;
};

export const errorMiddleware = (error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Payload inválido',
      details: error.flatten(),
      requestId: req.context?.requestId,
    });
    return;
  }

  const databaseUnavailable = isDatabaseUnavailableError(error);
  if (databaseUnavailable) {
    res.status(503).json({
      error: 'Banco de dados temporariamente indisponível. Tente novamente em instantes.',
      details: databaseUnavailable.prismaCode ? { prismaCode: databaseUnavailable.prismaCode } : undefined,
      requestId: req.context?.requestId,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        error: 'Conflito de unicidade no banco de dados.',
        meta: error.meta,
        requestId: req.context?.requestId,
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        error: 'Registro não encontrado.',
        requestId: req.context?.requestId,
      });
      return;
    }
  }

  const httpError = isHttpError(error) ? error : new HttpError(500, 'Erro interno do servidor.');

  if (env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[error]', {
      message: httpError.message,
      statusCode: httpError.statusCode,
      details: httpError.details,
      requestId: req.context?.requestId,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  res.status(httpError.statusCode).json({
    error: httpError.message,
    details: httpError.details,
    requestId: req.context?.requestId,
  });
};
