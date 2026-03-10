import { readAdminAuthToken } from './adminAuthToken';

const decodeBase64Url = (value: string): string | null => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLength)}`;
  try {
    if (typeof atob === 'function') {
      return atob(padded);
    }
    return null;
  } catch {
    return null;
  }
};

export const readAuthSubjectFromToken = (token: string | null): string | null => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  const payloadRaw = decodeBase64Url(parts[1]);
  if (!payloadRaw) return null;

  try {
    const payload = JSON.parse(payloadRaw) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
};

export const readActiveAuthSubject = (): string | null => readAuthSubjectFromToken(readAdminAuthToken());

export const getScopedAuthStorageKey = (baseKey: string): string => {
  const subject = readActiveAuthSubject();
  return `${baseKey}:${subject || 'anonymous'}`;
};
