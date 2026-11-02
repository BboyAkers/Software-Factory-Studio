import { useSyncExternalStore } from 'react';
import { serverNow } from '../api/state';

/**
 * One shared one-second ticker for every component that shows a relative time ("4m ago", "due in 2h").
 * It runs only while something is subscribed, and it reads the server's clock, not the laptop's (spec §16.2).
 */
let snapshot = Math.floor(serverNow() / 1000) * 1000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const next = Math.floor(serverNow() / 1000) * 1000;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // The clock may have moved while nobody was listening.
  tick();
  timer ??= setInterval(tick, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Milliseconds since the epoch on the server's clock, updated once a second. */
export const useNow = (): number => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
