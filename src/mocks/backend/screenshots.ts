import type { Browser, Screenshot, Viewport } from '../../contracts';
import { hash32 } from './codegen';

/** Default viewport matrix of spec §8.1. */
export const VIEWPORTS: { id: Viewport; width: number; height: number }[] = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'mobile', width: 390, height: 844 },
];
export const BROWSERS: Browser[] = ['chromium', 'firefox', 'webkit'];

const SURFACE = '#141414';
const CARD = '#242424';
const BAR = '#1a1a1a';
const PRIMARY = '#118dff';
const MUTED = '#757575';
const TEXT = '#f3f3f3';
const DANGER = '#ef4444';

interface Shot {
  route: string;
  title: string;
  viewport: { id: Viewport; width: number; height: number };
  browser: Browser;
  /** Draw a failed-assertion overlay. */
  failing: boolean;
  seed: number;
}

/**
 * A generated stand-in for a Playwright capture: a dark app page with navigation, cards and a table,
 * deterministic for a given route, viewport, browser and seed. Real captures replace this later.
 */
function svgFor(shot: Shot): string {
  const { width: W, height: H } = shot.viewport;
  const wide = W >= 768;
  const nav = wide ? Math.round(W * 0.16) : 0;
  const pad = Math.round(W * 0.025);
  const mainX = nav + pad;
  const mainW = W - mainX - pad;
  const cardCount = wide ? 4 : 2;
  const gap = Math.round(pad * 0.6);
  const cardW = Math.floor((mainW - gap * (cardCount - 1)) / cardCount);
  const cardH = Math.round(H * 0.12);
  const headY = 56;
  const rowH = Math.round(H * 0.045);
  const rows = Math.max(4, Math.floor((H - headY - cardH - 160) / (rowH + 6)));
  const font = Math.max(14, Math.round(W / 70));
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, system-ui, sans-serif">`,
    `<rect width="${W}" height="${H}" fill="${SURFACE}"/>`,
    `<rect width="${W}" height="48" fill="${BAR}"/>`,
    `<circle cx="22" cy="24" r="6" fill="${PRIMARY}"/>`,
    `<text x="40" y="29" font-size="${font}" fill="${TEXT}">${escape(shot.title)}</text>`,
    `<text x="${W - pad}" y="29" font-size="${font - 2}" fill="${MUTED}" text-anchor="end">${escape(shot.route)}</text>`,
  ];
  if (wide) {
    parts.push(`<rect y="48" width="${nav}" height="${H - 48}" fill="#1e1e1e"/>`);
    for (let i = 0; i < 7; i++) {
      const active = i === shot.seed % 7;
      parts.push(`<rect x="12" y="${68 + i * 40}" width="${nav - 24}" height="30" rx="4" fill="${active ? 'rgba(17,141,255,0.16)' : 'rgba(255,255,255,0.04)'}"/>`);
    }
  }
  parts.push(`<text x="${mainX}" y="${headY + 22}" font-size="${font + 6}" font-weight="600" fill="${TEXT}">${escape(shot.title)}</text>`);
  for (let i = 0; i < cardCount; i++) {
    const x = mainX + i * (cardW + gap);
    const value = 20 + ((shot.seed * (i + 3)) % 80);
    parts.push(
      `<rect x="${x}" y="${headY + 44}" width="${cardW}" height="${cardH}" rx="6" fill="${CARD}"/>`,
      `<text x="${x + 14}" y="${headY + 72}" font-size="${font - 2}" fill="${MUTED}">Metric ${i + 1}</text>`,
      `<text x="${x + 14}" y="${headY + 72 + font + 10}" font-size="${font + 8}" font-weight="600" fill="${TEXT}">${value}</text>`,
    );
  }
  const tableY = headY + 44 + cardH + 28;
  parts.push(`<rect x="${mainX}" y="${tableY}" width="${mainW}" height="${H - tableY - pad}" rx="6" fill="${CARD}"/>`);
  for (let r = 0; r < rows; r++) {
    const y = tableY + 14 + r * (rowH + 6);
    const w1 = Math.round(mainW * (0.18 + ((shot.seed + r * 7) % 20) / 100));
    parts.push(
      `<rect x="${mainX + 14}" y="${y}" width="${w1}" height="${Math.round(rowH * 0.45)}" rx="3" fill="rgba(255,255,255,0.14)"/>`,
      `<rect x="${mainX + 14}" y="${y + Math.round(rowH * 0.55)}" width="${Math.round(w1 * 0.6)}" height="${Math.round(rowH * 0.25)}" rx="3" fill="rgba(255,255,255,0.06)"/>`,
      `<rect x="${mainX + mainW - 14 - 70}" y="${y + 2}" width="70" height="${Math.round(rowH * 0.5)}" rx="10" fill="${r % 3 === 0 ? 'rgba(16,185,129,0.25)' : 'rgba(17,141,255,0.22)'}"/>`,
    );
  }
  if (shot.failing) {
    parts.push(
      `<rect x="${mainX}" y="${tableY - 14}" width="${mainW}" height="${rowH + 8}" rx="6" fill="rgba(239,68,68,0.18)" stroke="${DANGER}" stroke-width="2"/>`,
      `<text x="${mainX + 16}" y="${tableY - 14 + rowH * 0.7}" font-size="${font}" fill="${DANGER}">Assertion failed: element not visible</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const toDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Routes a workpack's e2e contract would visit, derived from the directory its files live in. */
export function routesFor(targetFiles: readonly string[]): string[] {
  const first = targetFiles.find((f) => !f.includes('*')) ?? '';
  const match = /^src\/(?:pages\/)?([a-z0-9-]+)\//.exec(first);
  const base = match?.[1] ? `/${match[1]}` : '/';
  return base === '/' ? ['/'] : [base, `${base}/details`];
}

export interface CaptureInput {
  idFor: () => string;
  title: string;
  targetFiles: readonly string[];
  /** Captures expire 30 days after this instant. */
  capturedAt: string;
  /** The route whose desktop Chromium capture shows a failed assertion. */
  failingRoute?: string | null;
}

const THIRTY_DAYS = 30 * 86_400_000;

/** One screenshot per route × viewport × browser. */
export function captureMatrix(input: CaptureInput): Screenshot[] {
  const out: Screenshot[] = [];
  for (const route of routesFor(input.targetFiles)) {
    for (const viewport of VIEWPORTS) {
      for (const browser of BROWSERS) {
        const seed = hash32(`${input.title}|${route}|${viewport.id}|${browser}`);
        out.push({
          id: input.idFor(),
          viewport: viewport.id,
          width: viewport.width,
          height: viewport.height,
          browser,
          route,
          uri: toDataUrl(svgFor({ route, title: input.title, viewport, browser, failing: input.failingRoute === route && browser === 'chromium' && viewport.id === 'desktop', seed })),
          capturedAt: input.capturedAt,
          expiresAt: new Date(Date.parse(input.capturedAt) + THIRTY_DAYS).toISOString(),
        });
      }
    }
  }
  return out;
}
