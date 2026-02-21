import type { RequestContext } from './request-context.js';

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
      authUserId?: string;
      stateTokenVersion?: string;
      stateAuthKind?: 'jwt' | 'state_token';
    }
  }
}

export {};
