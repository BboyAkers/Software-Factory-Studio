import { useEffect, useId, useMemo, useState } from 'react';
import type { NewWorkpackPreset } from '../../app/ui';
import { useEpics, useWorkpacks } from '../../api/queries';
import { useCreateWorkpack } from '../../api/mutations';
import { useCan } from '../../app/session';
import { globsOverlap } from '../../domain/queue';
import type { Priority } from '../../contracts';
import {
  Banner,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from '../ui';

const PRIORITIES: Priority[] = ['P0 Blocker', 'P1 High', 'P2 Normal'];
const CATEGORIES = ['Frontend', 'Backend', 'Infra', 'Tests', 'Docs'];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'feature';
}

function parseFileLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/^\.\//, ''))
    .filter(Boolean);
}

export function NewWorkpackDialog({
  open,
  preset,
  onClose,
}: {
  open: boolean;
  preset: NewWorkpackPreset;
  onClose: () => void;
}) {
  const epicsQuery = useEpics();
  const workpacksQuery = useWorkpacks();
  const createMutation = useCreateWorkpack();
  const holdForReviewCan = useCan('workpack.holdForReview');

  const [epicId, setEpicId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('P2 Normal');
  const [category, setCategory] = useState('Frontend');
  const [targetFilesText, setTargetFilesText] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [holdForReview, setHoldForReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const epics = useMemo(() => epicsQuery.data?.items ?? [], [epicsQuery.data?.items]);
  const allWorkpacks = useMemo(() => workpacksQuery.data?.items ?? [], [workpacksQuery.data?.items]);

  // Sync form with preset or defaults when opened
  useEffect(() => {
    if (!open) return;
    const initialEpic = preset.epicId || epics[0]?.id || '';
    setEpicId(initialEpic);
    setTitle(preset.title ?? '');
    setDescription('');
    setPriority('P2 Normal');
    setCategory('Frontend');
    setTargetFilesText((preset.targetFiles ?? []).join('\n'));
    setDependsOn(preset.dependsOn ?? []);
    setHoldForReview(false);
    setError(null);
  }, [open, preset, epics]);

  // If epicId wasn't set because epics loaded later, set it
  useEffect(() => {
    if (open && !epicId && epics.length > 0) {
      setEpicId(epics[0]!.id);
    }
  }, [open, epicId, epics]);

  // Workpacks within the selected Epic available for dependency selection
  const candidateDeps = useMemo(() => {
    if (!epicId) return [];
    return allWorkpacks.filter((w) => w.epicId === epicId);
  }, [allWorkpacks, epicId]);

  const parsedTargetFiles = useMemo(() => parseFileLines(targetFilesText), [targetFilesText]);

  // Check file overlap with running workpacks (planning, in-progress, verification)
  const overlapWarning = useMemo(() => {
    if (parsedTargetFiles.length === 0) return null;
    const running = allWorkpacks.filter(
      (w) => w.status === 'planning' || w.status === 'in-progress' || w.status === 'verification'
    );
    for (const w of running) {
      if (globsOverlap(parsedTargetFiles, w.targetFiles)) {
        return `Target files overlap with running workpack ${w.id}. This workpack will queue behind it.`;
      }
    }
    return null;
  }, [parsedTargetFiles, allWorkpacks]);

  // Relative path validation
  const invalidPath = useMemo(() => {
    for (const p of parsedTargetFiles) {
      if (p.startsWith('/') || p.startsWith('../') || p.includes('/../')) {
        return `Invalid file path: "${p}". Paths must be relative to workspace root and cannot contain "..".`;
      }
    }
    return null;
  }, [parsedTargetFiles]);

  const branchPreview = useMemo(() => {
    return `factory/WP-...-${slugify(title)}`;
  }, [title]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!epicId) {
      setError('An Epic is required.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    if (invalidPath) {
      setError(invalidPath);
      return;
    }

    createMutation.mutate(
      {
        epicId,
        title: title.trim(),
        description: description.trim(),
        priority,
        category,
        targetFiles: parsedTargetFiles,
        dependsOn,
        holdForReview,
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to create workpack');
        },
      }
    );
  };

  const formId = useId();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New workpack"
      description="Create a workpack within an active Epic. Specialist assignment and branch creation are fully managed."
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-[12px] text-on-surface-variant font-mono truncate max-w-[340px]">
            Branch: <span className="text-on-surface font-semibold">{branchPreview}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              loading={createMutation.isPending}
              disabled={title.trim().length < 3 || !epicId || Boolean(invalidPath)}
            >
              Create workpack
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {overlapWarning && <Banner tone="warning">{overlapWarning}</Banner>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Epic" required hint="Parent Epic tracking requirements and budget">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                value={epicId}
                onChange={(e) => {
                  setEpicId(e.target.value);
                  setDependsOn([]);
                }}
                required
              >
                {epics.length === 0 ? (
                  <option value="">No active Epics found</option>
                ) : (
                  epics.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.id} · {ep.title}
                    </option>
                  ))
                )}
              </Select>
            )}
          </Field>

          <Field label="Category" required>
            {(fieldProps) => (
              <Select {...fieldProps} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Title" required hint="At least 3 characters">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Webhook Signature Verification"
              required
              minLength={3}
            />
          )}
        </Field>

        <Field label="Description" hint="Optional context and implementation guidelines">
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Details about requirements or constraints..."
            />
          )}
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Priority" required>
            {(fieldProps) => (
              <Select {...fieldProps} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Language" hint="Fixed across project">
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value="TypeScript"
                readOnly
                disabled
                className="bg-surface-sunken opacity-80 cursor-not-allowed"
              />
            )}
          </Field>
        </div>

        <Field
          label="Target files"
          hint="Relative paths, one per line (e.g. src/api/webhooks.ts or src/billing/**)"
          error={invalidPath ?? undefined}
        >
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              value={targetFilesText}
              onChange={(e) => setTargetFilesText(e.target.value)}
              rows={3}
              placeholder={"src/domain/rules.ts\nsrc/api/routes.ts"}
              className="font-mono text-[12px]"
            />
          )}
        </Field>

        {candidateDeps.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-on-surface">Depends on</span>
            <span className="text-[12px] text-on-surface-variant">
              Workpacks in the same Epic that must finish before this begins
            </span>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 rounded border border-fluent-border bg-surface-sunken">
              {candidateDeps.map((dep) => {
                const checked = dependsOn.includes(dep.id);
                return (
                  <button
                    key={dep.id}
                    type="button"
                    onClick={() => {
                      setDependsOn((prev) =>
                        checked ? prev.filter((id) => id !== dep.id) : [...prev, dep.id]
                      );
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium border transition-colors ${
                      checked
                        ? 'bg-brand/20 border-brand text-brand'
                        : 'bg-surface-card border-fluent-border text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span>{dep.id}</span>
                    <span className="text-[11px] opacity-75 truncate max-w-[150px]">{dep.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-fluent-border">
          <Toggle
            label="Hold for review"
            description="Require human review before merge even when auto-merge policies are satisfied"
            checked={holdForReview}
            onChange={setHoldForReview}
            disabled={!holdForReviewCan.allowed}
            disabledReason={!holdForReviewCan.allowed ? holdForReviewCan.reason : undefined}
          />
        </div>
      </form>
    </Dialog>
  );
}
