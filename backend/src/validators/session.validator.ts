import { z } from 'zod';

export const closeSessionSchema = z.object({
  nextSession: z.boolean().default(true),
});
