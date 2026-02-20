import { Prisma } from '@prisma/client';

export const toDecimal = (value: number | string | Prisma.Decimal): Prisma.Decimal => {
  return new Prisma.Decimal(value);
};

export const toNumber = (value: Prisma.Decimal | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return value.toNumber();
};

export const roundMoney = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const roundQuantity = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
};
