import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'OPERATOR', 'AUDITOR']);

export const userCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
  name: z.string().trim().min(2).max(120).optional(),
  role: userRoleSchema.default('OPERATOR'),
  isActive: z.boolean().default(true),
});

const userCredentialSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
  name: z.string().trim().min(2).max(120).optional(),
});

export const companyUsersCreateSchema = z
  .object({
    companyName: z.string().trim().min(2).max(120),
    manager: userCredentialSchema,
    operator: userCredentialSchema,
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.manager.email.trim().toLowerCase() === value.operator.email.trim().toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operator', 'email'],
        message: 'E-mail do operador deve ser diferente do ADMGERENTE.',
      });
    }
  });

export const companyUsersLinkSchema = z
  .object({
    companyName: z.string().trim().min(2).max(120),
    managerEmail: z.string().email().max(255),
    operatorEmail: z.string().email().max(255),
  })
  .superRefine((value, ctx) => {
    if (value.managerEmail.trim().toLowerCase() === value.operatorEmail.trim().toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operatorEmail'],
        message: 'E-mail do operador deve ser diferente do ADMGERENTE.',
      });
    }
  });

export const companyBillingSchema = z.object({
  blocked: z.boolean(),
  message: z.string().trim().min(4).max(600).optional(),
  blockedDays: z.number().int().min(1).max(3650).optional(),
});

export const companyStatusSchema = z.object({
  isActive: z.boolean(),
});

export const companyLayoutThemeSchema = z.object({
  layoutThemeId: z.enum(['red', 'orange', 'amber', 'blue', 'emerald', 'violet']),
  layoutCompanyName: z.string().trim().max(120).nullable().optional(),
});

export const COMPANY_PURGE_CONFIRMATION_PHRASE = 'EXCLUIRUSER';

export const companyPurgeSchema = z
  .object({
    firstConfirmation: z.string().trim().min(1),
    secondConfirmation: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.firstConfirmation !== COMPANY_PURGE_CONFIRMATION_PHRASE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['firstConfirmation'],
        message: `Digite exatamente ${COMPANY_PURGE_CONFIRMATION_PHRASE} para confirmar.`,
      });
    }
    if (value.secondConfirmation !== COMPANY_PURGE_CONFIRMATION_PHRASE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secondConfirmation'],
        message: `Digite exatamente ${COMPANY_PURGE_CONFIRMATION_PHRASE} para confirmar.`,
      });
    }
  });
