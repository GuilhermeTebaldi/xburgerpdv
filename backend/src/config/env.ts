import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGINS: z.string().default(''),
  DEFAULT_TIMEZONE: z.string().default('America/Sao_Paulo'),
  APP_STATE_BACKUP_RETENTION_DAYS: z.coerce.number().int().min(7).max(365).default(35),
  APP_STATE_BACKUP_SCHEDULER_ENABLED: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return true;
      const normalized = value.trim().toLowerCase();
      return !['0', 'false', 'off', 'no'].includes(normalized);
    }),
  APP_STATE_BACKUP_CHECK_INTERVAL_MS: z.coerce.number().int().min(60000).max(86400000).default(3600000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  throw new Error('Falha ao validar variáveis de ambiente');
}

const corsOrigins = parsed.data.CORS_ORIGINS.split(',')
  .map((origin: string) => origin.trim())
  .filter(Boolean);

export const env = {
  ...parsed.data,
  corsOrigins,
};
