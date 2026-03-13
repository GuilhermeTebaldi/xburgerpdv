import { getScopedAuthStorageKey } from './authScope';

export type PrintPresetId = 'PADRAO' | '48x297' | '58x297' | '72x297' | '80x297' | 'A4';
export type PrintPreferenceField = 'historyClosingPreset' | 'cashReportPreset' | 'receiptHistoryPreset';

export interface UserPrintPreferences {
  historyClosingPreset: PrintPresetId | null;
  cashReportPreset: PrintPresetId | null;
  receiptHistoryPreset: PrintPresetId | null;
}

export interface ResolvedPrintPreferences {
  historyClosingPreset: PrintPresetId;
  cashReportPreset: PrintPresetId;
  receiptHistoryPreset: PrintPresetId;
}

interface PrintPresetOption {
  id: PrintPresetId;
  label: string;
  widthMm: number | null;
}

const PRINT_PRESET_OPTIONS: PrintPresetOption[] = [
  { id: 'PADRAO', label: 'Padrao', widthMm: null },
  { id: '48x297', label: '48 x 297 mm', widthMm: 48 },
  { id: '58x297', label: '58 x 297 mm', widthMm: 58 },
  { id: '72x297', label: '72 x 297 mm', widthMm: 72 },
  { id: '80x297', label: '80 x 297 mm', widthMm: 80 },
  { id: 'A4', label: 'A4 210 x 297 mm', widthMm: 210 },
];

export const PRINT_PRESET_OPTIONS_ALL = PRINT_PRESET_OPTIONS;
export const PRINT_PRESET_OPTIONS_NO_DEFAULT = PRINT_PRESET_OPTIONS.filter((option) => option.id !== 'PADRAO');

export const DEFAULT_PRINT_PREFERENCES: ResolvedPrintPreferences = {
  historyClosingPreset: '80x297',
  cashReportPreset: 'PADRAO',
  receiptHistoryPreset: 'PADRAO',
};

const STORAGE_KEYS: Record<PrintPreferenceField, string> = {
  historyClosingPreset: 'xburger_history_print_preset_v1',
  cashReportPreset: 'xburger_cash_print_preset_v1',
  receiptHistoryPreset: 'xburger_receipt_print_preset_v1',
};

const LEGACY_RECEIPT_PAPER_WIDTH_KEY = 'xburger_receipt_paper_width_mm';
const LEGACY_DEFAULT_WIDTH_MM = 58;
const LEGACY_MIN_WIDTH_MM = 48;
const LEGACY_MAX_WIDTH_MM = 80;

const PRESET_ID_SET = new Set<PrintPresetId>(PRINT_PRESET_OPTIONS.map((option) => option.id));

const PRESET_WIDTH_BY_ID = new Map<PrintPresetId, number>(
  PRINT_PRESET_OPTIONS.filter((option) => option.widthMm !== null).map((option) => [option.id, option.widthMm as number])
);

const clampLegacyPaperWidthMm = (value: number): number =>
  Math.min(LEGACY_MAX_WIDTH_MM, Math.max(LEGACY_MIN_WIDTH_MM, Math.round(value)));

export const isPrintPresetId = (value: unknown): value is PrintPresetId =>
  typeof value === 'string' && PRESET_ID_SET.has(value as PrintPresetId);

const normalizePreset = (value: unknown): PrintPresetId | null => (isPrintPresetId(value) ? value : null);

const inferPresetFromLegacyPaperWidth = (widthMm: number): PrintPresetId | null => {
  if (widthMm === 48) return '48x297';
  if (widthMm === 58) return '58x297';
  if (widthMm === 72) return '72x297';
  if (widthMm === 80) return '80x297';
  return null;
};

const readLegacyReceiptWidthOverrideMm = (): number | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LEGACY_RECEIPT_PAPER_WIDTH_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return clampLegacyPaperWidthMm(parsed);
};

const readLocalPresetField = (field: PrintPreferenceField): PrintPresetId | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getScopedAuthStorageKey(STORAGE_KEYS[field]));
    return normalizePreset(raw);
  } catch {
    return null;
  }
};

export const readLegacyReceiptPaperWidthMm = (): number => {
  if (typeof window === 'undefined') return LEGACY_DEFAULT_WIDTH_MM;
  const raw = window.localStorage.getItem(LEGACY_RECEIPT_PAPER_WIDTH_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return LEGACY_DEFAULT_WIDTH_MM;
  return clampLegacyPaperWidthMm(parsed);
};

export const readLocalPrintPreferences = (): UserPrintPreferences => {
  const historyClosingPreset = readLocalPresetField('historyClosingPreset');
  const cashReportPreset = readLocalPresetField('cashReportPreset');
  const receiptFromPreset = readLocalPresetField('receiptHistoryPreset');
  const receiptLegacyOverrideMm = readLegacyReceiptWidthOverrideMm();
  const receiptFromLegacyWidth =
    receiptLegacyOverrideMm === null ? null : inferPresetFromLegacyPaperWidth(receiptLegacyOverrideMm);

  return {
    historyClosingPreset,
    cashReportPreset,
    receiptHistoryPreset: receiptFromPreset ?? receiptFromLegacyWidth,
  };
};

export const writeLocalPrintPreference = (field: PrintPreferenceField, preset: PrintPresetId): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getScopedAuthStorageKey(STORAGE_KEYS[field]), preset);
  } catch {
    // ignore storage failures
  }
};

export const writeLocalPrintPreferences = (preferences: ResolvedPrintPreferences): void => {
  writeLocalPrintPreference('historyClosingPreset', preferences.historyClosingPreset);
  writeLocalPrintPreference('cashReportPreset', preferences.cashReportPreset);
  writeLocalPrintPreference('receiptHistoryPreset', preferences.receiptHistoryPreset);
};

export const resolvePrintPreferences = (
  remote: UserPrintPreferences | null,
  local: UserPrintPreferences
): ResolvedPrintPreferences => ({
  historyClosingPreset:
    normalizePreset(remote?.historyClosingPreset) ??
    normalizePreset(local.historyClosingPreset) ??
    DEFAULT_PRINT_PREFERENCES.historyClosingPreset,
  cashReportPreset:
    normalizePreset(remote?.cashReportPreset) ??
    normalizePreset(local.cashReportPreset) ??
    DEFAULT_PRINT_PREFERENCES.cashReportPreset,
  receiptHistoryPreset:
    normalizePreset(remote?.receiptHistoryPreset) ??
    normalizePreset(local.receiptHistoryPreset) ??
    DEFAULT_PRINT_PREFERENCES.receiptHistoryPreset,
});

export const buildLocalMigrationPatch = (
  remote: UserPrintPreferences | null,
  local: UserPrintPreferences
): Partial<UserPrintPreferences> => {
  if (!remote) return {};
  const patch: Partial<UserPrintPreferences> = {};

  if (remote.historyClosingPreset === null && normalizePreset(local.historyClosingPreset)) {
    patch.historyClosingPreset = local.historyClosingPreset;
  }
  if (remote.cashReportPreset === null && normalizePreset(local.cashReportPreset)) {
    patch.cashReportPreset = local.cashReportPreset;
  }
  if (remote.receiptHistoryPreset === null && normalizePreset(local.receiptHistoryPreset)) {
    patch.receiptHistoryPreset = local.receiptHistoryPreset;
  }

  return patch;
};

export const hasPrintPreferencesPatch = (patch: Partial<UserPrintPreferences>): boolean =>
  Object.keys(patch).length > 0;

export const resolvePaperWidthMmForPreset = (preset: PrintPresetId): number => {
  if (preset === 'PADRAO') {
    return readLegacyReceiptPaperWidthMm();
  }
  return PRESET_WIDTH_BY_ID.get(preset) ?? LEGACY_DEFAULT_WIDTH_MM;
};

export const syncLegacyReceiptPaperWidthFromPreset = (preset: PrintPresetId): void => {
  if (typeof window === 'undefined') return;
  if (preset === 'PADRAO') {
    try {
      window.localStorage.removeItem(LEGACY_RECEIPT_PAPER_WIDTH_KEY);
    } catch {
      // ignore storage failures
    }
    return;
  }

  const widthMm = PRESET_WIDTH_BY_ID.get(preset);
  if (!widthMm) return;

  try {
    window.localStorage.setItem(LEGACY_RECEIPT_PAPER_WIDTH_KEY, String(widthMm));
  } catch {
    // ignore storage failures
  }
};
