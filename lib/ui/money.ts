/**
 * Display currency layer. Listings are *priced and stored* in USD cents
 * (settlement currency of the marketplace). A buyer's display preference only
 * converts the rendered value; checkout totals are always settled in USD.
 */
export const DISPLAY_CURRENCIES = [
  { code: 'USD', label: 'US Dollar', symbol: '$', rate: 1 },
  { code: 'EUR', label: 'Euro', symbol: '€', rate: 0.92 },
  { code: 'GBP', label: 'Pound Sterling', symbol: '£', rate: 0.79 },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$', rate: 1.36 },
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]['code'];

export function fxRate(code: string): number {
  return DISPLAY_CURRENCIES.find((c) => c.code === code)?.rate ?? 1;
}

export function convert(cents: number, code: string): number {
  return Math.round(cents * fxRate(code));
}

/** $450 · $1,299 · $2,499.99 — whole amounts hide trailing zeros. */
export function money(cents: number, code: DisplayCurrency | string = 'USD', locale = 'en-US'): string {
  const amount = (cents / 100) * fxRate(code);
  const decimals = Number.isInteger(cents / 100) && code === 'USD' ? 0 : Number.isInteger(amount) ? 0 : 2;
  const symbol = DISPLAY_CURRENCIES.find((c) => c.code === code)?.symbol ?? '$';
  return `${symbol}${amount.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
}

/** Parse a price input ("1,299.50" / "$1299") into USD cents. */
export function parseUsd(input: string | number): number | null {
  const raw = typeof input === 'number' ? String(input) : input.replace(/[^0-9.]/g, '');
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}
