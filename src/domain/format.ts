const MICROS = 1_000_000;

/** `$1,234.56`. Amounts under a dollar keep three decimals so small costs stay visible. */
export function usd(micros: number | null | undefined, digits?: number): string {
  if (micros === null || micros === undefined) return '—';
  const dollars = micros / MICROS;
  const places = digits ?? (Math.abs(dollars) > 0 && Math.abs(dollars) < 1 ? 3 : 2);
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: places, maximumFractionDigits: places });
}

/** `$3.8k` / `$1.2M`, for tight spaces. */
export function usdCompact(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return '—';
  const dollars = micros / MICROS;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return usd(micros);
}

/** `1.4k`, `14.2M`. */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** `4m 12s`, `2h 5m`, `3d 4h`. */
export function duration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** `4m ago`, `in 2h`, `just now`. `nowMs` should come from `useNow()` so server skew is applied. */
export function relativeTime(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return '—';
  const diff = Date.parse(iso) - nowMs;
  const abs = Math.abs(diff);
  if (abs < 5_000) return 'just now';
  const text = abs < 60_000 ? `${Math.round(abs / 1000)}s` : abs < 3_600_000 ? `${Math.round(abs / 60_000)}m` : abs < 86_400_000 ? `${Math.round(abs / 3_600_000)}h` : `${Math.round(abs / 86_400_000)}d`;
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

export const shortSha = (sha: string | null | undefined): string => (sha ? sha.slice(0, 7) : '—');

export const percent = (ratio: number | null | undefined, digits = 1): string =>
  ratio === null || ratio === undefined ? '—' : `${(ratio * 100).toFixed(digits)}%`;

export const clockTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
