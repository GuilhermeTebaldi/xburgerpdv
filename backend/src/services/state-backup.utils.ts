export const toBackupDay = (value: Date, timeZone: string): Date => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Falha ao resolver chave diária de backup.');
  }

  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
};

export const addDays = (value: Date, days: number): Date => {
  return new Date(value.getTime() + days * 86400000);
};

export const toDateOnlyKey = (value: Date): string => {
  return value.toISOString().slice(0, 10);
};
