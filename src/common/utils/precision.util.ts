/**
 * Precision utilities to avoid IEEE-754 floating-point inaccuracies
 */

export function roundCurrency(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(qty: number): number {
  return Math.round((qty + Number.EPSILON) * 1000) / 1000;
}
