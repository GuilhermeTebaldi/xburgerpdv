import cors, { type CorsOptions } from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { requestContextMiddleware } from './middlewares/request-context.middleware.js';
import { apiRouter } from './routes/index.js';

const app = express();
const localhostOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const DEFAULT_ALLOWED_ORIGIN_PATTERNS = [
  'https://xburgerpdv.com.br',
  'https://www.xburgerpdv.com.br',
  'https://app.xburgerpdv.com.br',
  'https://xburgerpdv.vercel.app',
  'https://*.xburgerpdv.com.br',
];

const normalizeOrigin = (value: string): string => {
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const port = url.port ? `:${url.port}` : '';
    return `${protocol}//${hostname}${port}`;
  } catch {
    return value.trim().toLowerCase();
  }
};

const normalizeOriginPattern = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes('*')) return trimmed;
  return normalizeOrigin(trimmed);
};

const allowedOriginPatterns = Array.from(
  new Set([...DEFAULT_ALLOWED_ORIGIN_PATTERNS, ...env.corsOrigins].map(normalizeOriginPattern).filter(Boolean))
);

const isWildcardOriginMatch = (origin: string, pattern: string): boolean => {
  if (!pattern.includes('*')) {
    return normalizeOrigin(origin) === normalizeOrigin(pattern);
  }

  try {
    const originUrl = new URL(origin);
    const patternUrl = new URL(pattern);

    if (originUrl.protocol.toLowerCase() !== patternUrl.protocol.toLowerCase()) {
      return false;
    }

    if (patternUrl.port && originUrl.port !== patternUrl.port) {
      return false;
    }

    const wildcardHost = patternUrl.hostname.toLowerCase();
    if (!wildcardHost.startsWith('*.')) {
      return false;
    }

    const baseHost = wildcardHost.slice(2);
    const candidateHost = originUrl.hostname.toLowerCase();
    if (candidateHost === baseHost) {
      return false;
    }

    return candidateHost.endsWith(`.${baseHost}`);
  } catch {
    return false;
  }
};

const isOriginAllowed = (origin: string): boolean => {
  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOriginPatterns.some((allowedOrigin) =>
    isWildcardOriginMatch(normalizedOrigin, allowedOrigin)
  );
};

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (localhostOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }

      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }) satisfies CorsOptions['origin'],
    credentials: false,
    maxAge: 86400,
    exposedHeaders: ['ETag', 'X-State-Version', 'X-State-Token'],
  })
);
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(requestContextMiddleware);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/v1', apiRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
