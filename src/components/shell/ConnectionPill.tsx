import { useConnection } from '../../api/stream';
import { discardOffline, useOfflineQueue } from '../../app/offline';
import { useNow } from '../../app/useNow';
import { relativeTime } from '../../domain/format';
import { Icon, IconButton, Popover, StatusDot, cx } from '../ui';
import { PILL, PILL_TONE } from './pill';

function Queue() {
  const queue = useOfflineQueue();
  const now = useNow();
  if (queue.length === 0) return <p className="px-4 py-3 text-[13px] text-on-surface-variant">Nothing is waiting to be sent.</p>;
  return (
    <>
      <p className="border-b border-fluent-border px-4 py-2.5 text-[12px] leading-4 text-on-surface-variant">Sent in this order when the connection returns. Discard anything you no longer want.</p>
      <ul className="max-h-72 divide-y divide-fluent-border overflow-y-auto">
        {queue.map((action) => (
          <li key={action.id} className="flex items-center gap-2 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-on-surface">{action.label}</p>
              <p className="text-[12px] text-on-surface-variant" title={action.queuedAt}>
                Queued {relativeTime(action.queuedAt, now)}
              </p>
            </div>
            <IconButton icon="delete" label={`Discard: ${action.label}`} size="sm" iconSize={16} onClick={() => discardOffline(action.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Live, reconnecting or offline. While offline, or while queued actions are still being sent, it opens a
 * list of those actions, each of which can be discarded.
 */
export function ConnectionPill() {
  const { state } = useConnection();
  const queued = useOfflineQueue().length;

  if (state === 'live' && queued === 0) {
    return (
      <span className={cx(PILL, PILL_TONE.success, 'cursor-default')}>
        <StatusDot tone="success" pulse />
        Live
      </span>
    );
  }

  const tone = state === 'offline' ? 'danger' : 'warning';
  const text =
    state === 'live' ? `Sending ${queued} queued` : state === 'reconnecting' ? (queued > 0 ? `Reconnecting · ${queued} queued` : 'Reconnecting…') : queued > 0 ? `Offline · ${queued} queued` : 'Offline';

  return (
    <Popover
      label="Queued actions"
      align="end"
      className="w-80"
      trigger={(props) => (
        <button {...props} className={cx(PILL, PILL_TONE[tone])}>
          {state === 'offline' ? <Icon name="cloud_off" size={16} /> : <Icon name="sync" size={16} className="motion-safe:animate-spin" />}
          {text}
        </button>
      )}
    >
      {() => <Queue />}
    </Popover>
  );
}
