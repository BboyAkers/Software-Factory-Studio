import { useResumePipeline } from '../../api/mutations';
import { usePipelineStatus } from '../../api/queries';
import { useConnection } from '../../api/stream';
import { useOfflineQueue } from '../../app/offline';
import { Can } from '../../app/session';
import { ui } from '../../app/ui';
import { useNow } from '../../app/useNow';
import { relativeTime } from '../../domain/format';
import { Banner, Button } from '../ui';

/** Full-width strips under the header. They appear and clear from stream events, with no reload. */
const STRIP = 'border-x-0 border-t-0';

export function Banners() {
  const status = usePipelineStatus();
  const { state } = useConnection();
  const queued = useOfflineQueue().length;
  const resume = useResumePipeline();
  const now = useNow();
  const data = status.data;
  const pausedByHand = data?.pausedReasons.includes('manual-global') ?? false;

  return (
    <div className="shrink-0 empty:hidden">
      {state === 'offline' && (
        <Banner tone="danger" icon="cloud_off" className={STRIP}>
          Offline. Showing the last data we have.
          {queued > 0 && ` ${queued} action${queued === 1 ? ' is' : 's are'} queued and will be sent when the connection returns.`}
        </Banner>
      )}

      {data?.hardCapHit && (
        <Banner
          tone="danger"
          icon="error"
          className={STRIP}
          action={
            <Can capability="budget.update">
              <Button size="sm" onClick={ui.openBudget}>
                Raise cap
              </Button>
            </Can>
          }
        >
          Budget hard cap reached. Runs are paused until an Admin raises the cap or the month rolls over.
        </Banner>
      )}

      {pausedByHand && data && (
        <Banner
          tone="warning"
          icon="pause_circle"
          className={STRIP}
          action={
            <Can capability="pipeline.pause">
              <Button size="sm" icon="play_arrow" loading={resume.isPending} onClick={() => resume.mutate(undefined)}>
                Resume pipeline
              </Button>
            </Can>
          }
        >
          Pipeline paused by {data.pausedBy ?? 'someone'}
          {data.pausedAt && <span className="text-on-surface-variant"> {relativeTime(data.pausedAt, now)}</span>}.
        </Banner>
      )}
    </div>
  );
}
