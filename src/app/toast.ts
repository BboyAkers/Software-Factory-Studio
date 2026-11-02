import { createStore, useStore } from '../api/state';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

const MAX_VISIBLE = 4;
const AUTO_DISMISS_MS = 5_000;

export const toastStore = createStore<Toast[]>([]);
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

export function dismissToast(id: string): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  toastStore.set((list) => list.filter((t) => t.id !== id));
}

function show(tone: ToastTone, message: string, options: { detail?: string; action?: Toast['action'] } = {}): string {
  const id = `toast-${++counter}`;
  toastStore.set((list) => [...list, { id, tone, message, ...options }].slice(-MAX_VISIBLE));
  // Errors wait for a person; everything else clears itself (spec §16.2).
  if (tone !== 'error') timers.set(id, setTimeout(() => dismissToast(id), AUTO_DISMISS_MS));
  return id;
}

/** Toasts are for the person's own actions and the soft-limit alert. There is no notification centre (Slack only, spec §13.4). */
export const toast = {
  success: (message: string, options?: { detail?: string; action?: Toast['action'] }) => show('success', message, options),
  info: (message: string, options?: { detail?: string; action?: Toast['action'] }) => show('info', message, options),
  warning: (message: string, options?: { detail?: string; action?: Toast['action'] }) => show('warning', message, options),
  error: (message: string, options?: { detail?: string; action?: Toast['action'] }) => show('error', message, options),
  dismiss: dismissToast,
};

export const useToasts = (): Toast[] => useStore(toastStore);
