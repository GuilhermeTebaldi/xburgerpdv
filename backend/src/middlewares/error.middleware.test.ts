import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

import { errorMiddleware } from './error.middleware.js';

const createRequest = (requestId: string): Request =>
  ({
    context: {
      requestId,
      origin: 'API',
    },
  }) as Request;

const createResponse = (): {
  res: Response;
  getStatusCode: () => number;
  getPayload: () => unknown;
} => {
  let statusCode = 200;
  let payload: unknown;
  const res = {
    status: (nextStatusCode: number) => {
      statusCode = nextStatusCode;
      return res;
    },
    json: (nextPayload: unknown) => {
      payload = nextPayload;
      return res;
    },
  } as unknown as Response;

  return {
    res,
    getStatusCode: () => statusCode,
    getPayload: () => payload,
  };
};

const noopNext: NextFunction = () => undefined;

test('errorMiddleware responde 503 quando prismaCode indica indisponibilidade temporária do banco', () => {
  const req = createRequest('req-db-down-code');
  const response = createResponse();

  errorMiddleware(
    {
      code: 'P1001',
      message: "Can't reach database server",
    },
    req,
    response.res,
    noopNext
  );

  assert.equal(response.getStatusCode(), 503);
  assert.deepEqual(response.getPayload(), {
    error: 'Banco de dados temporariamente indisponível. Tente novamente em instantes.',
    details: { prismaCode: 'P1001' },
    requestId: 'req-db-down-code',
  });
});

test('errorMiddleware responde 503 quando erro indica banco em startup', () => {
  const req = createRequest('req-db-startup');
  const response = createResponse();

  errorMiddleware(
    new Error('database system is starting up'),
    req,
    response.res,
    noopNext
  );

  assert.equal(response.getStatusCode(), 503);
  assert.deepEqual(response.getPayload(), {
    error: 'Banco de dados temporariamente indisponível. Tente novamente em instantes.',
    details: undefined,
    requestId: 'req-db-startup',
  });
});
