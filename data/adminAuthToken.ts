const ADMIN_AUTH_TOKEN_KEY = 'xburger_admin_auth_token';

const sanitizeToken = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const decodeBase64Url = (value: string): string | null => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLength)}`;
  try {
    if (typeof atob !== 'function') return null;
    return atob(padded);
  } catch {
    return null;
  }
};

const readJwtExpirationMs = (token: string): number | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadRaw = decodeBase64Url(parts[1]);
  if (!payloadRaw) return null;

  try {
    const payload = JSON.parse(payloadRaw) as { exp?: unknown };
    const expSeconds = Number(payload.exp);
    if (!Number.isFinite(expSeconds) || expSeconds <= 0) return null;
    return expSeconds * 1000;
  } catch {
    return null;
  }
};

const isJwtExpired = (token: string, safetyWindowMs = 5000): boolean => {
  const expiresAtMs = readJwtExpirationMs(token);
  if (expiresAtMs === null) return false;
  return Date.now() + safetyWindowMs >= expiresAtMs;
};

const readTokenFromStorage = (): string | null => {
  if (typeof window === 'undefined') return null;

  try {
    const sessionToken = sanitizeToken(window.sessionStorage.getItem(ADMIN_AUTH_TOKEN_KEY));
    if (sessionToken) return sessionToken;
  } catch {
    // ignore storage read failures
  }

  try {
    return sanitizeToken(window.localStorage.getItem(ADMIN_AUTH_TOKEN_KEY));
  } catch {
    return null;
  }
};

export const readAdminAuthToken = (): string | null => {
  const token = readTokenFromStorage();
  if (!token) return null;
  if (!isJwtExpired(token)) return token;

  clearAdminAuthToken();
  return null;
};

export const invalidateAdminSession = (): void => {
  clearAdminAuthToken();
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem('xburger_admin_gate');
    window.localStorage.removeItem('xburger_admin_gate');
    window.sessionStorage.removeItem('xburger_admin_session_backup');
    window.localStorage.removeItem('xburger_admin_session');
  } catch {
    // ignore storage cleanup failures
  }
};

export const hasAdminAuthToken = (): boolean => Boolean(readAdminAuthToken());

export const persistAdminAuthToken = (token: string, persistent: boolean): void => {
  if (typeof window === 'undefined') return;
  const normalized = sanitizeToken(token);
  if (!normalized) return;

  try {
    window.sessionStorage.setItem(ADMIN_AUTH_TOKEN_KEY, normalized);
  } catch {
    // ignore storage write failures
  }

  try {
    if (persistent) {
      window.localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, normalized);
    } else {
      window.localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage write failures
  }
};

export const clearAdminAuthToken = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
  } catch {
    // ignore storage write failures
  }
  try {
    window.localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
  } catch {
    // ignore storage write failures
  }
};
