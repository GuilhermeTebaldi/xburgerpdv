import { z } from 'zod';

export const reportQuerySchema = z.object({
  scope: z.enum(['current', 'all', 'session']).default('current'),
  sessionId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
