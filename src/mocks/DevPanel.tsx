import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { sessionStore, useStore } from '../api/state';
import { toast } from '../app/toast';
import { Button, Icon, IconButton, SegmentedControl, Select } from '../components/ui';
import type { IssueKind } from './backend/intakeSim';
import type { ScenarioId } from './backend/store';
import type { MockControl, SpeedOption } from './control';
import { parseMockToken } from './http';
import { PersonaList, useSwitchPersona } from './PersonaPicker';
import { SCENARIOS } from './seeds';

const ISSUES: { kind: IssueKind; label: string }[] = [
  { kind: 'accepted', label: 'Accepted' },
  { kind: 'duplicate', label: 'Duplicate' },
  { kind: 'rejected', label: 'Rejected' },
  { kind: 'unsupported-language', label: 'Unsupported language' },
];

const CLOCK: { ms: number; label: string }[] = [
  { ms: 10 * 60_000, label: '+10 min' },
  { ms: 60 * 60_000, label: '+1 h' },
  { ms: 5 * 60 * 60_000, label: '+5 h' },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-fluent-border px-4 py-3">
      <h3 className="mb-2 text-[12px] font-semibold text-on-surface-variant">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The simulated backend's controls (spec Appendix H), collapsed at the right edge. These never go through
 * REST: they reach into the in-memory world directly, the way a person at the server console would.
 */
export function DevPanel({ control }: { control: MockControl }) {
  const [open, setOpen] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => control.subscribe(rerender), [control]);

  const client = useQueryClient();
  const switchPersona = useSwitchPersona();
  const { token } = useStore(sessionStore);
  const state = control.state();
  const scenario = SCENARIOS.find((s) => s.id === state.scenario);
  const refetch = () => void client.invalidateQueries();

  return (
    <aside aria-label="Mock backend controls" className="fixed top-24 right-0 z-[80] flex items-start">
      {!open ? (
        <button
          type="button"
          aria-expanded={false}
          aria-controls="dev-panel"
          onClick={() => setOpen(true)}
          className="focus-ring flex h-24 w-7 flex-col items-center justify-center gap-1.5 rounded-l-md border border-r-0 border-fluent-border-high bg-surface-card-high text-on-surface-variant transition-colors duration-150 hover:text-on-surface"
        >
          <Icon name="science" size={16} />
          <span className="text-[12px] font-medium [writing-mode:vertical-rl]">Dev</span>
        </button>
      ) : (
        <div id="dev-panel" className="max-h-[80vh] w-80 overflow-y-auto rounded-l-lg border border-r-0 border-fluent-border-high bg-surface-card-high shadow-fluent-elevation-16">
          <header className="flex items-center justify-between px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-on-surface">Mock backend</h2>
            <IconButton icon="chevron_right" label="Collapse" size="sm" aria-expanded onClick={() => setOpen(false)} />
          </header>

          <Group title="Viewing as">
            <PersonaList currentId={parseMockToken(token)?.id} onPick={switchPersona} />
          </Group>

          <Group title="Scenario">
            <Select
              aria-label="Scenario"
              value={state.scenario}
              onChange={(event) => {
                void control.setScenario(event.target.value as ScenarioId).then(refetch);
              }}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            {scenario && <p className="mt-1.5 text-[12px] leading-4 text-on-surface-variant">{scenario.description}</p>}
          </Group>

          <Group title="Speed">
            <SegmentedControl<`${SpeedOption}`>
              label="Simulation speed"
              size="sm"
              value={`${state.speed}`}
              onChange={(value) => control.setSpeed(Number(value) as SpeedOption)}
              options={[
                { value: '1', label: '1×' },
                { value: '4', label: '4×' },
                { value: '16', label: '16×' },
              ]}
            />
          </Group>

          <Group title="Advance the clock">
            <div className="flex gap-1.5">
              {CLOCK.map((step) => (
                <Button
                  key={step.ms}
                  size="sm"
                  onClick={() => {
                    control.advanceClock(step.ms);
                    refetch();
                  }}
                >
                  {step.label}
                </Button>
              ))}
            </div>
          </Group>

          <Group title="Simulate a GitHub issue">
            <div className="grid grid-cols-2 gap-1.5">
              {ISSUES.map((issue) => (
                <Button
                  key={issue.kind}
                  size="sm"
                  onClick={() => {
                    const number = control.simulateIssue(issue.kind);
                    toast.info(number ? `Filed issue #${number}` : 'No issue to re-deliver', { detail: `${issue.label}. The webhook arrives in a second.` });
                  }}
                >
                  {issue.label}
                </Button>
              ))}
            </div>
          </Group>

          <Group title="Network">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" icon="power_off" onClick={control.dropStreams}>
                Drop stream
              </Button>
              <Button
                size="sm"
                icon={state.offline ? 'cloud' : 'cloud_off'}
                onClick={() => {
                  control.setOffline(!state.offline);
                  refetch();
                }}
              >
                {state.offline ? 'Go online' : 'Go offline'}
              </Button>
            </div>
          </Group>

          <Group title="Break something">
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                icon="gpp_bad"
                onClick={() => {
                  const id = control.corruptAudit();
                  toast.warning(id ? `Altered audit entry ${id}` : 'There is no audit entry to alter', { detail: 'Verify the chain on the Audit Log page to see it named.' });
                }}
              >
                Corrupt an audit entry
              </Button>
              <Button
                size="sm"
                icon="timer_off"
                onClick={() => {
                  const id = control.triggerSla();
                  toast.info(id ? `${id} breached its SLA` : 'No open P0 or P1 workpack to breach');
                  refetch();
                }}
              >
                Trigger SLA breach
              </Button>
            </div>
          </Group>

          <Group title="World">
            <Button
              size="sm"
              icon="restart_alt"
              onClick={() => {
                void control.reset().then(refetch);
              }}
            >
              Reset
            </Button>
          </Group>
        </div>
      )}
    </aside>
  );
}
