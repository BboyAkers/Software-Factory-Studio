import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useBudget } from '../../api/queries';
import { useConnection, useFactoryEvents } from '../../api/stream';
import { replayOffline, useOfflineQueue } from '../../app/offline';
import { toast } from '../../app/toast';
import { ui } from '../../app/ui';
import { usd } from '../../domain/format';

/**
 * Alerts that are not tied to a page: crossing the soft limit, and a benchmark finishing. A toast fires on
 * the moment a threshold is crossed, never on load when the project is already past it.
 */
export function useGlobalAlerts(): void {
  const budget = useBudget();
  const soft = useRef<boolean | null>(null);

  useEffect(() => {
    if (budget.data && soft.current === null) soft.current = budget.data.softLimitHit;
  }, [budget.data]);

  useFactoryEvents(({ event }) => {
    if (event.type === 'budget.updated') {
      if (soft.current === false && event.softLimitHit && !event.hardCapHit) {
        const cap = budget.data?.monthlyCapUsdMicros;
        toast.warning('Budget soft limit reached', {
          ...(cap ? { detail: `${usd(event.spendUsdMicros, 0)} of ${usd(cap, 0)} is spent this month.` } : {}),
          action: { label: 'Open budget', run: ui.openBudget },
        });
      }
      soft.current = event.softLimitHit;
    }
    if (event.type === 'benchmark.completed') {
      const message = `Benchmark finished: ${event.passed} of ${event.total} cases passed.`;
      if (event.passed === event.total) toast.success(message);
      else toast.warning(message);
    }
  });
}

/** When the connection comes back, send what was queued while it was down, in order. */
export function useOfflineReplay(): void {
  const client = useQueryClient();
  const { state } = useConnection();
  const queued = useOfflineQueue().length;
  useEffect(() => {
    if (state === 'live' && queued > 0) void replayOffline(client);
  }, [state, queued, client]);
}

/** ⌘K or Ctrl+K opens and closes the command palette from anywhere. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ui.togglePalette();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
