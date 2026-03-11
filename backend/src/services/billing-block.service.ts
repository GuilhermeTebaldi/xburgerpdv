const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_BILLING_BLOCK_MESSAGE =
  'Seu acesso ao XBURGERPDV foi bloqueado temporariamente. Regularize com o financeiro para liberar o sistema.';

export interface BillingBlockFields {
  billingBlocked: boolean;
  billingBlockedMessage?: string | null;
  billingBlockedUntil?: Date | string | null;
}

export interface BillingBlockSnapshot {
  isBlocked: boolean;
  message: string | null;
  blockedUntil: Date | null;
  daysRemaining: number | null;
}

const toDateOrNull = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
};

export const resolveBillingBlockSnapshot = (
  fields: BillingBlockFields,
  now: Date = new Date()
): BillingBlockSnapshot => {
  const blockedUntil = toDateOrNull(fields.billingBlockedUntil);

  if (!fields.billingBlocked) {
    return {
      isBlocked: false,
      message: null,
      blockedUntil,
      daysRemaining: null,
    };
  }

  if (blockedUntil && blockedUntil.getTime() <= now.getTime()) {
    return {
      isBlocked: false,
      message: null,
      blockedUntil,
      daysRemaining: 0,
    };
  }

  const trimmed = fields.billingBlockedMessage?.trim();
  const message = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BILLING_BLOCK_MESSAGE;
  const daysRemaining =
    blockedUntil === null ? null : Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / DAY_MS));

  return {
    isBlocked: true,
    message,
    blockedUntil,
    daysRemaining,
  };
};

export const buildDefaultBillingBlockedMessage = (blockedDays: number, blockedUntil: Date): string =>
  `Seu acesso ao XBURGERPDV foi bloqueado por inadimplência por ${blockedDays} dia(s), até ${blockedUntil.toLocaleDateString(
    'pt-BR'
  )}. Regularize com o financeiro para liberar o sistema.`;

export const toBillingBlockErrorDetails = (snapshot: BillingBlockSnapshot) => ({
  code: 'BILLING_BLOCKED',
  billingBlocked: snapshot.isBlocked,
  billingBlockedMessage: snapshot.message,
  billingBlockedUntil: snapshot.blockedUntil ? snapshot.blockedUntil.toISOString() : null,
  billingBlockedDaysRemaining: snapshot.daysRemaining,
});
