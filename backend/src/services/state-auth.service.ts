import jwt from 'jsonwebtoken';
import type { Secret } from 'jsonwebtoken';

import { getAuthEnv } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

const STATE_TOKEN_EXPIRATION = '30m';

interface StateWriteTokenPayload {
  typ: 'state_write';
  ver: string;
  sub?: string;
}

interface IssueStateWriteTokenInput {
  version: string;
  actorUserId?: string;
}

interface VerifyStateWriteTokenInput {
  token: string;
}

export const issueStateWriteToken = (input: IssueStateWriteTokenInput): string => {
  const authEnv = getAuthEnv();
  const payload: StateWriteTokenPayload = {
    typ: 'state_write',
    ver: input.version,
  };

  if (input.actorUserId) {
    payload.sub = input.actorUserId;
  }

  return jwt.sign(
    payload,
    authEnv.JWT_SECRET as Secret,
    {
      expiresIn: STATE_TOKEN_EXPIRATION,
    }
  );
};

export const verifyStateWriteToken = (
  input: VerifyStateWriteTokenInput
): StateWriteTokenPayload => {
  const authEnv = getAuthEnv();
  try {
    const payload = jwt.verify(input.token, authEnv.JWT_SECRET) as StateWriteTokenPayload;

    if (payload.typ !== 'state_write' || typeof payload.ver !== 'string' || payload.ver.trim() === '') {
      throw new HttpError(401, 'Token de estado inválido.');
    }

    return payload;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, 'Token de estado inválido ou expirado.');
  }
};
