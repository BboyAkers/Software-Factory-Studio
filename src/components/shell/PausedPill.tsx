import { useResumePipeline } from '../../api/mutations';
import { usePipelineStatus } from '../../api/queries';
import { AppLink } from '../../app/nav';
import { Can } from '../../app/session';
import { ui } from '../../app/ui';
import { useNow } from '../../app/useNow';
import { relativeTime } from '../../domain/format';
import { Button, Icon, Popover, buttonClass, cx } from '../ui';
import { PILL, PILL_TONE } from './pill';

/** The project-wide reasons that can hold the pipeline, in the words a person would use. */
const REASONS: Record<string, { short: string; title: string }> = {
  'manual-global': { short: 'by hand', title: 'Paused by hand' },
  'budget-hard-cap': { short: 'budget cap', title: 'Budget hard cap reached' },
  'integration-disabled': { short: 'GitHub off', title: 'The GitHub integration is off' },
};

const reasonOf = (reason: string) => REASONS[reason] ?? { short: reason, title: reason };

function Reasons({ close }: { close: () => void }) {
  const status = usePipelineStatus();
  const resume = useResumePipeline();
  const now = useNow();
  const data = status.data;
  if (!data) return null;

  return (
    <ul className="divide-y divide-fluent-border">
      {data.pausedReasons.map((reason) => (
        <li key={reason} className="flex flex-col gap-2 px-4 py-3">
          <p className="text-[13px] font-semibold text-on-surface">{reasonOf(reason).title}</p>
          {reason === 'manual-global' && (
            <>
              <p className="text-[12px] leading-4 text-on-surface-variant">
                {data.pausedBy ?? 'Someone'} paused it {relativeTime(data.pausedAt, now)}. Work continues from where it stopped when the pipeline resumes.
              </p>
              <Can capability="pipeline.pause">
                <Button size="sm" icon="play_arrow" className="self-start" loading={resume.isPending} onClick={() => resume.mutate(undefined, { onSuccess: close })}>
                  Resume pipeline
                </Button>
              </Can>
            </>
          )}
          {reason === 'budget-hard-cap' && (
            <>
              <p className="text-[12px] leading-4 text-on-surface-variant">Spending reached the monthly cap. Everything resumes when an Admin raises the cap or the month rolls over.</p>
              <Button
                size="sm"
                className="self-start"
                onClick={() => {
                  close();
                  ui.openBudget();
                }}
              >
                Open budget
              </Button>
            </>
          )}
          {reason === 'integration-disabled' && (
            <>
              <p className="text-[12px] leading-4 text-on-surface-variant">Intake and merges wait until GitHub is switched on again.</p>
              <AppLink to="settings" search={{ section: 'integrations' }} onClick={close} className={cx(buttonClass('secondary', 'sm'), 'self-start')}>
                Open settings
              </AppLink>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Shown only while something holds the pipeline. It names the reasons; its popover says who and when. */
export function PausedPill() {
  const status = usePipelineStatus();
  const data = status.data;
  if (!data?.paused) return null;
  const summary = data.pausedReasons.length === 1 ? reasonOf(data.pausedReasons[0] ?? '').short : `${data.pausedReasons.length} reasons`;

  return (
    <Popover
      label="Why the pipeline is paused"
      align="end"
      className="w-80"
      trigger={(props) => (
        <button {...props} className={cx(PILL, PILL_TONE.warning)}>
          <Icon name="pause_circle" size={16} />
          Paused
          <span className="hidden lg:inline">· {summary}</span>
        </button>
      )}
    >
      {(close) => <Reasons close={close} />}
    </Popover>
  );
}
