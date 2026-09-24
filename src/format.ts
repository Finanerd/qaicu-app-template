// Ready-made formatting + math helpers. Qaicu stores every value as a STRING, so
// use these to parse/format instead of hand-rolling Number()/toFixed (which a
// small model gets wrong). Import from './ui' (they are re-exported there) or
// from './format'. Numbers and dates follow the viewer's browser locale; currency
// defaults to EUR.

/** Parse a possibly-string value to a finite number; returns `fallback` on junk. */
export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const n = parseFloat(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : fallback;
}

// These run per cell per render, and constructing an Intl.NumberFormat costs far
// more than formatting with one — so build each distinct formatter once.
const formatters = new Map<string, Intl.NumberFormat>();
function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cached = formatters.get(key);
  if (cached) return cached;
  const created = new Intl.NumberFormat(undefined, options);
  formatters.set(key, created);
  return created;
}

/** Format as currency, e.g. money("12.5") -> "12,50 €" (fi-FI) or "€12.50" (en-US). */
export function money(v: unknown, currency = 'EUR'): string {
  return formatter(`c:${currency}`, { style: 'currency', currency }).format(num(v));
}

/** Format as a plain decimal with fixed digits, e.g. decimal("3.1") -> "3.10" (en-US). */
export function decimal(v: unknown, digits = 2): string {
  return formatter(`d:${digits}`, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num(v));
}

/** Format a 0..1 ratio as a percentage, e.g. percent(0.25) -> "25%" (en-US). */
export function percent(v: unknown, digits = 0): string {
  return formatter(`p:${digits}`, { style: 'percent', maximumFractionDigits: digits }).format(num(v));
}

/** Sum a numeric field over items. key is a property name or an accessor fn. */
export function sum<T>(items: T[], key: keyof T | ((t: T) => unknown)): number {
  return items.reduce((acc, it) => acc + num(typeof key === 'function' ? key(it) : it[key]), 0);
}

/** Group items into { key: items[] } using an accessor fn. */
export function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const it of items) {
    const k = key(it);
    (out[k] ??= []).push(it);
  }
  return out;
}

/** Today's date as an "YYYY-MM-DD" string (the format Qaicu Date values use). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format a date value (string or Date) for display, e.g. "7/24/2026" (en-US) or "24.7.2026" (fi-FI). */
export function formatDate(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v ?? ''));
  return isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleDateString();
}

/** A unique id, handy as a row externalId when you add records yourself. */
export function uid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
