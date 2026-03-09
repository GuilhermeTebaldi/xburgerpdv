const ADMIN_AUTH_TOKEN_KEY = 'xburger_admin_auth_token';

const sanitizeToken = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const readAdminAuthToken = (): string | null => {
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
