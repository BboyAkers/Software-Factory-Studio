import { useState } from 'react';
import { usePausePipeline, useResumePipeline } from '../../api/mutations';
import { usePipelineStatus } from '../../api/queries';
import { Can } from '../../app/session';
import { Button, Dialog, IconButton, ProgressBar, Skeleton } from '../ui';

/** `n/8 running` with a bar. The numbers come from the pipeline status, never from a constant. */
export function CapacityMeter({ compact }: { compact: boolean }) {
  const status = usePipelineStatus();
  if (!status.data) return <Skeleton className={compact ? 'mx-auto h-8 w-9' : 'h-9 w-full'} />;
  const { used, max } = status.data.capacity;
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1" title={`${used} of ${max} slots running`}>
        <span className="text-[12px] leading-none font-medium text-on-surface-variant tabular-nums">
          {used}/{max}
        </span>
        <ProgressBar value={(used / max) * 100} label="Pipeline capacity" size="sm" className="w-9" />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="text-on-surface-variant">Capacity</span>
        <span className="font-medium text-on-surface tabular-nums">
          {used}/{max} running
        </span>
      </div>
      <ProgressBar value={(used / max) * 100} label="Pipeline capacity" />
    </div>
  );
}

/**
 * Pause or resume the whole pipeline. Visible to everyone, usable by Maintainers. Pausing says how many
 * workpacks it will stop and asks first; resuming is safe and does not ask.
 */
export function PauseControl({ compact }: { compact: boolean }) {
  const status = usePipelineStatus();
  const pause = usePausePipeline();
  const resume = useResumePipeline();
  const [confirming, setConfirming] = useState(false);

  const paused = status.data?.pausedReasons.includes('manual-global') ?? false;
  const open = status.data?.active ?? 0;
  const loading = status.isPending;
  const close = () => setConfirming(false);

  const label = paused ? 'Resume pipeline' : 'Pause pipeline';
  const icon = paused ? 'play_arrow' : 'pause_circle';
  const run = () => (paused ? resume.mutate(undefined) : setConfirming(true));

  return (
    <>
      <Can capability="pipeline.pause">
        {compact ? (
          <IconButton icon={icon} label={label} variant="secondary" disabled={loading} loading={resume.isPending} onClick={run} />
        ) : (
          <Button className="w-full" variant="secondary" icon={icon} disabled={loading} loading={resume.isPending} onClick={run}>
            {label}
          </Button>
        )}
      </Can>

      <Dialog
        open={confirming}
        onClose={close}
        dismissible={!pause.isPending}
        size="sm"
        title="Pause the pipeline?"
        description={open === 0 ? 'No workpacks are open right now.' : `${open} workpack${open === 1 ? '' : 's'} will pause.`}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pause.isPending}>
              Keep running
            </Button>
            <Button variant="primary" loading={pause.isPending} onClick={() => pause.mutate(undefined, { onSuccess: close })}>
              Pause pipeline
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-on-surface-variant">
          Running agents stop at the end of their turn and queued work waits. Nothing is lost: everything continues from where it stopped when someone resumes the pipeline.
        </p>
      </Dialog>
    </>
  );
}
