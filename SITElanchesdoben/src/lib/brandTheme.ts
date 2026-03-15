export const BRAND_THEME_STORAGE_KEY = 'xburger_brand_theme_v1';

export type BrandShade =
  | '50'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | '950';

export type BrandPalette = Record<BrandShade, string>;

export type BrandThemeId = 'red' | 'orange' | 'amber' | 'blue' | 'emerald' | 'violet';

interface BrandThemeDefinition {
  label: string;
  palette: BrandPalette;
}

export const BRAND_THEMES: Record<BrandThemeId, BrandThemeDefinition> = {
  red: {
    label: 'Vermelho Padrão',
    palette: {
      '50': '#fef2f2',
      '100': '#fee2e2',
      '200': '#fecaca',
      '300': '#fca5a5',
      '400': '#f87171',
      '500': '#ef4444',
      '600': '#dc2626',
      '700': '#b91c1c',
      '800': '#991b1b',
      '900': '#7f1d1d',
      '950': '#450a0a',
    },
  },
  orange: {
    label: 'Laranja',
    palette: {
      '50': '#fff7ed',
      '100': '#ffedd5',
      '200': '#fed7aa',
      '300': '#fdba74',
      '400': '#fb923c',
      '500': '#f97316',
      '600': '#ea580c',
      '700': '#c2410c',
      '800': '#9a3412',
      '900': '#7c2d12',
      '950': '#431407',
    },
  },
  amber: {
    label: 'Âmbar',
    palette: {
      '50': '#fffbeb',
      '100': '#fef3c7',
      '200': '#fde68a',
      '300': '#fcd34d',
      '400': '#fbbf24',
      '500': '#f59e0b',
      '600': '#d97706',
      '700': '#b45309',
      '800': '#92400e',
      '900': '#78350f',
      '950': '#451a03',
    },
  },
  blue: {
    label: 'Azul',
    palette: {
      '50': '#eff6ff',
      '100': '#dbeafe',
      '200': '#bfdbfe',
      '300': '#93c5fd',
      '400': '#60a5fa',
      '500': '#3b82f6',
      '600': '#2563eb',
      '700': '#1d4ed8',
      '800': '#1e40af',
      '900': '#1e3a8a',
      '950': '#172554',
    },
  },
  emerald: {
    label: 'Esmeralda',
    palette: {
      '50': '#ecfdf5',
      '100': '#d1fae5',
      '200': '#a7f3d0',
      '300': '#6ee7b7',
      '400': '#34d399',
      '500': '#10b981',
      '600': '#059669',
      '700': '#047857',
      '800': '#065f46',
      '900': '#064e3b',
      '950': '#022c22',
    },
  },
  violet: {
    label: 'Violeta',
    palette: {
      '50': '#f5f3ff',
      '100': '#ede9fe',
      '200': '#ddd6fe',
      '300': '#c4b5fd',
      '400': '#a78bfa',
      '500': '#8b5cf6',
      '600': '#7c3aed',
      '700': '#6d28d9',
      '800': '#5b21b6',
      '900': '#4c1d95',
      '950': '#2e1065',
    },
  },
};

export const DEFAULT_BRAND_THEME_ID: BrandThemeId = 'red';

const COLOR_HEX_REGEX = /^#([0-9a-f]{6})$/i;

const isBrandThemeId = (value: string): value is BrandThemeId =>
  Object.prototype.hasOwnProperty.call(BRAND_THEMES, value);

const hexToRgbTriplet = (hex: string): string => {
  const normalized = hex.trim().toLowerCase();
  if (!COLOR_HEX_REGEX.test(normalized)) return '220 38 38';

  const value = normalized.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `${red} ${green} ${blue}`;
};

const normalizeThemeId = (raw: string | null | undefined): BrandThemeId => {
  if (!raw) return DEFAULT_BRAND_THEME_ID;
  const normalized = raw.trim().toLowerCase();
  return isBrandThemeId(normalized) ? normalized : DEFAULT_BRAND_THEME_ID;
};

export const readStoredBrandTheme = (): BrandThemeId => {
  if (typeof window === 'undefined') return DEFAULT_BRAND_THEME_ID;
  try {
    return normalizeThemeId(window.localStorage.getItem(BRAND_THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_BRAND_THEME_ID;
  }
};

export const applyBrandTheme = (
  rawThemeId: string,
  options: { persist?: boolean } = {}
): BrandThemeId => {
  const themeId = normalizeThemeId(rawThemeId);
  const theme = BRAND_THEMES[themeId];

  if (typeof document !== 'undefined') {
    const root = document.documentElement;

    (Object.entries(theme.palette) as Array<[BrandShade, string]>).forEach(([shade, color]) => {
      root.style.setProperty(`--xb-red-${shade}`, color);
      root.style.setProperty(`--xb-red-${shade}-rgb`, hexToRgbTriplet(color));
    });

    root.style.setProperty('--color-brand-red', theme.palette['600']);
    root.setAttribute('data-xb-brand-theme', themeId);
  }

  if (options.persist !== false && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BRAND_THEME_STORAGE_KEY, themeId);
    } catch {
      // ignore persist failures
    }
  }

  return themeId;
};

export const initializeBrandTheme = (): BrandThemeId =>
  applyBrandTheme(readStoredBrandTheme(), { persist: false });
