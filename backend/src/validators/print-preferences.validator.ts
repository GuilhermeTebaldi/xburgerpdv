import { z } from 'zod';

export const PRINT_PRESET_IDS = ['PADRAO', '48x297', '58x297', '72x297', '80x297', 'A4'] as const;

export const printPresetIdSchema = z.enum(PRINT_PRESET_IDS);

const nullablePrintPresetSchema = printPresetIdSchema.nullable();

export const printPreferencesUpdateSchema = z
  .object({
    historyClosingPreset: nullablePrintPresetSchema.optional(),
    cashReportPreset: nullablePrintPresetSchema.optional(),
    receiptHistoryPreset: nullablePrintPresetSchema.optional(),
  })
  .strict();

export type PrintPresetId = z.infer<typeof printPresetIdSchema>;
export type PrintPreferencesUpdateInput = z.infer<typeof printPreferencesUpdateSchema>;
