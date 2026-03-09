import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'OPERATOR', 'AUDITOR']);

export const userCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
  name: z.string().trim().min(2).max(120).optional(),
  role: userRoleSchema.default('OPERATOR'),
  isActive: z.boolean().default(true),
});

