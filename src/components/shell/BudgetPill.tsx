import { useBudget } from '../../api/queries';
import { ui } from '../../app/ui';
import { usd } from '../../domain/format';
import { Icon, Skeleton, cx } from '../ui';
import { PILL, PILL_TONE } from './pill';

const whole = (micros: number) => usd(micros, micros >= 10_000_000 ? 0 : 2);

/**
 * `$spend / $cap · runway`. Neutral until the soft limit, amber past it, red at the hard cap, and the
 * words and icon change with the color. A click opens the Budget modal.
 */
export function BudgetPill() {
  const budget = useBudget();
  const data = budget.data;
  if (!data) return budget.isError ? <BudgetButton tone="neutral" icon="payments" text="Budget unavailable" /> : <Skeleton className="h-7 w-36 rounded-full" />;

  const tone = data.hardCapHit ? 'danger' : data.softLimitHit ? 'warning' : 'neutral';
  const icon = data.hardCapHit ? 'error' : data.softLimitHit ? 'warning' : 'payments';
  const runway = data.runway ? `${data.runway.days}d ${data.runway.hours}h runway` : null;
  const status = data.hardCapHit ? 'Hard cap reached' : data.softLimitHit ? 'Soft limit passed' : 'Within budget';

  return (
    <BudgetButton
      tone={tone}
      icon={icon}
      text={`${whole(data.spendUsdMicros)} / ${whole(data.monthlyCapUsdMicros)}`}
      runway={runway}
      title={`${status}. ${whole(data.spendUsdMicros)} of ${whole(data.monthlyCapUsdMicros)} spent this month (${data.percentUsed.toFixed(0)}%).${runway ? ` ${runway}.` : ''}`}
    />
  );
}

function BudgetButton({ tone, icon, text, runway, title }: { tone: 'neutral' | 'warning' | 'danger'; icon: string; text: string; runway?: string | null; title?: string }) {
  return (
    <button type="button" onClick={ui.openBudget} title={title} className={cx(PILL, PILL_TONE[tone])}>
      <Icon name={icon} size={16} />
      <span className="tabular-nums">{text}</span>
      {runway && <span className="hidden text-on-surface-variant xl:inline">· {runway}</span>}
      <span className="sr-only">Open budget</span>
    </button>
  );
}
