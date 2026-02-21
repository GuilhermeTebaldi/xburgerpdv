const API_TIMEOUT_MS = 4000;
const DEFAULT_API_BASE_URL = 'https://xburger-backend.onrender.com';

export interface PublicProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: string;
}

const resolveApiBaseUrl = (): string => {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const normalized = raw ? raw.replace(/\/+$/, '') : '';
  if (normalized) return normalized;
  return DEFAULT_API_BASE_URL;
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const isProductRecord = (value: unknown): value is PublicProduct => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim() !== '' &&
    typeof candidate.name === 'string' &&
    candidate.name.trim() !== '' &&
    typeof candidate.price === 'number' &&
    Number.isFinite(candidate.price) &&
    typeof candidate.category === 'string' &&
    candidate.category.trim() !== '' &&
    typeof candidate.imageUrl === 'string'
  );
};

const normalizeProducts = (value: unknown): PublicProduct[] => {
  if (!Array.isArray(value)) return [];
  const uniqueProducts = new Map<string, PublicProduct>();

  value.forEach((item) => {
    if (!isProductRecord(item)) return;
    uniqueProducts.set(item.id, {
      id: item.id,
      name: item.name,
      price: item.price,
      category: item.category,
      imageUrl: item.imageUrl,
    });
  });

  return Array.from(uniqueProducts.values());
};

export const fetchPublicProducts = async (): Promise<PublicProduct[]> => {
  const apiBaseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${apiBaseUrl}/api/v1/state`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar produtos: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }

  return normalizeProducts((payload as Record<string, unknown>).products);
};
