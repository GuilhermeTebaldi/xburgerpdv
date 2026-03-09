const API_TIMEOUT_MS = 4000;
const DEFAULT_API_BASE_URL = 'https://xburger-saas-backend.onrender.com';
const CACHED_PUBLIC_PRODUCTS_KEY = 'xburger_public_products_v2';

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

const normalizeCategory = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return normalized;
  if (normalized === 'SNACK') return 'Snack';
  if (normalized === 'DRINK') return 'Drink';
  if (normalized === 'SIDE') return 'Side';
  if (normalized === 'COMBO') return 'Combo';
  return normalized;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toNumericPrice = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const isProductRecord = (
  value: unknown
): value is {
  id: string;
  name: string;
  price: number | string;
  imageUrl: string;
  category: string;
} => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const hasNumericPrice = toNumericPrice(candidate.price) !== null;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim() !== '' &&
    typeof candidate.name === 'string' &&
    candidate.name.trim() !== '' &&
    hasNumericPrice &&
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
    const normalizedPrice = toNumericPrice(item.price);
    if (normalizedPrice === null) return;
    uniqueProducts.set(item.id, {
      id: item.id,
      name: item.name,
      price: normalizedPrice,
      category: normalizeCategory(item.category),
      imageUrl: item.imageUrl,
    });
  });

  return Array.from(uniqueProducts.values());
};

const writeCachedProducts = (products: PublicProduct[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CACHED_PUBLIC_PRODUCTS_KEY, JSON.stringify(products));
  } catch {
    // ignore storage write failures
  }
};

export const readCachedPublicProducts = (): PublicProduct[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(CACHED_PUBLIC_PRODUCTS_KEY);
    if (!raw) return [];
    return normalizeProducts(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
};

const loadProductsFromEndpoint = async (url: string): Promise<PublicProduct[]> => {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar produtos: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (Array.isArray(payload)) {
    return normalizeProducts(payload);
  }
  if (isObjectRecord(payload) && Array.isArray(payload.products)) {
    return normalizeProducts(payload.products);
  }
  return [];
};

export const fetchPublicProducts = async (): Promise<PublicProduct[]> => {
  const apiBaseUrl = resolveApiBaseUrl();
  const endpoints = [`${apiBaseUrl}/api/v1/products/public`];
  let lastError: Error | null = null;
  let emptyResult: PublicProduct[] | null = null;

  for (const endpoint of endpoints) {
    try {
      const products = await loadProductsFromEndpoint(endpoint);
      if (products.length === 0) {
        if (emptyResult === null) {
          emptyResult = products;
        }
        continue;
      }
      writeCachedProducts(products);
      return products;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Falha ao carregar produtos');
    }
  }

  const cachedProducts = readCachedPublicProducts();
  if (cachedProducts.length > 0) {
    return cachedProducts;
  }

  if (emptyResult) {
    return emptyResult;
  }

  throw lastError ?? new Error('Falha ao carregar produtos');
};
