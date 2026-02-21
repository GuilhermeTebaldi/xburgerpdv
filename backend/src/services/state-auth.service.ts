import jwt from 'jsonwebtoken';
import type { Secret } from 'jsonwebtoken';

import { env } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

const STATE_TOKEN_EXPIRATION = '30m';

interface StateWriteTokenPayload {
  typ: 'state_write';
  ver: string;
  sub?: string;
  ip?: string;
  ua?: string;
}

interface IssueStateWriteTokenInput {
  version: string;
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface VerifyStateWriteTokenInput {
  token: string;
  ipAddress?: string;
  userAgent?: string;
}

export const issueStateWriteToken = (input: IssueStateWriteTokenInput): string => {
  return jwt.sign(
    {
      typ: 'state_write',
      ver: input.version,
      sub: input.actorUserId,
      ip: input.ipAddress || undefined,
      ua: input.userAgent || undefined,
    } satisfies StateWriteTokenPayload,
    env.JWT_SECRET as Secret,
    {
      expiresIn: STATE_TOKEN_EXPIRATION,
    }
  );
};

export const verifyStateWriteToken = (
  input: VerifyStateWriteTokenInput
): StateWriteTokenPayload => {
  try {
    const payload = jwt.verify(input.token, env.JWT_SECRET) as StateWriteTokenPayload;

    if (payload.typ !== 'state_write' || typeof payload.ver !== 'string' || payload.ver.trim() === '') {
      throw new HttpError(401, 'Token de estado inválido.');
    }

    if (payload.ip && input.ipAddress && payload.ip !== input.ipAddress) {
      throw new HttpError(401, 'Token de estado inválido para este IP.');
    }

    const expectedUserAgent = input.userAgent || '';
    if (payload.ua && payload.ua !== expectedUserAgent) {
      throw new HttpError(401, 'Token de estado inválido para este agente.');
    }

    return payload;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, 'Token de estado inválido ou expirado.');
  }
};
