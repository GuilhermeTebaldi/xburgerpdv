import { prisma } from '../db/prisma.js';
import {
  PRINT_PRESET_IDS,
  type PrintPreferencesUpdateInput,
  type PrintPresetId,
} from '../validators/print-preferences.validator.js';

export interface UserPrintPreferences {
  historyClosingPreset: PrintPresetId | null;
  cashReportPreset: PrintPresetId | null;
  receiptHistoryPreset: PrintPresetId | null;
}

const PRINT_PRESET_SET = new Set<string>(PRINT_PRESET_IDS);

const normalizePreset = (value: string | null): PrintPresetId | null => {
  if (!value) return null;
  return PRINT_PRESET_SET.has(value) ? (value as PrintPresetId) : null;
};

const normalizeRecord = (
  record:
    | {
        historyClosingPreset: string | null;
        cashReportPreset: string | null;
        receiptHistoryPreset: string | null;
      }
    | null
): UserPrintPreferences => ({
  historyClosingPreset: normalizePreset(record?.historyClosingPreset ?? null),
  cashReportPreset: normalizePreset(record?.cashReportPreset ?? null),
  receiptHistoryPreset: normalizePreset(record?.receiptHistoryPreset ?? null),
});

const hasOwn = (source: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(source, key);

export class PrintPreferencesService {
  async getByUserId(userId: string): Promise<UserPrintPreferences> {
    const record = await prisma.userPrintPreference.findUnique({
      where: { userId },
      select: {
        historyClosingPreset: true,
        cashReportPreset: true,
        receiptHistoryPreset: true,
      },
    });

    return normalizeRecord(record);
  }

  async updateByUserId(userId: string, input: PrintPreferencesUpdateInput): Promise<UserPrintPreferences> {
    const hasHistoryClosingPreset = hasOwn(input, 'historyClosingPreset');
    const hasCashReportPreset = hasOwn(input, 'cashReportPreset');
    const hasReceiptHistoryPreset = hasOwn(input, 'receiptHistoryPreset');

    if (!hasHistoryClosingPreset && !hasCashReportPreset && !hasReceiptHistoryPreset) {
      return this.getByUserId(userId);
    }

    const updateData: {
      historyClosingPreset?: string | null;
      cashReportPreset?: string | null;
      receiptHistoryPreset?: string | null;
    } = {};

    if (hasHistoryClosingPreset) {
      updateData.historyClosingPreset = input.historyClosingPreset ?? null;
    }
    if (hasCashReportPreset) {
      updateData.cashReportPreset = input.cashReportPreset ?? null;
    }
    if (hasReceiptHistoryPreset) {
      updateData.receiptHistoryPreset = input.receiptHistoryPreset ?? null;
    }

    const record = await prisma.userPrintPreference.upsert({
      where: { userId },
      create: {
        userId,
        historyClosingPreset: hasHistoryClosingPreset ? input.historyClosingPreset ?? null : null,
        cashReportPreset: hasCashReportPreset ? input.cashReportPreset ?? null : null,
        receiptHistoryPreset: hasReceiptHistoryPreset ? input.receiptHistoryPreset ?? null : null,
      },
      update: updateData,
      select: {
        historyClosingPreset: true,
        cashReportPreset: true,
        receiptHistoryPreset: true,
      },
    });

    return normalizeRecord(record);
  }
}
