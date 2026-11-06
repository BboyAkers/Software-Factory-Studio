import { useEffect, useState } from 'react';
import type { Workpack } from '../../../contracts';
import { useRequestChanges } from '../../../api/mutations';
import { Banner, Button, Dialog, Field, Textarea } from '../../../components/ui';

export interface RequestChangesDialogProps {
  open: boolean;
  workpack: Workpack | null;
  onClose: () => void;
}

export function RequestChangesDialog({ open, workpack, onClose }: RequestChangesDialogProps) {
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestMutation = useRequestChanges();

  useEffect(() => {
    if (open) {
      setComments('');
      setError(null);
    }
  }, [open]);

  if (!workpack) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comments.trim()) {
      setError('Comments are required to explain what changes the agent must make.');
      return;
    }

    requestMutation.mutate(
      {
        workpack: { id: workpack.id, version: workpack.version },
        text: comments.trim(),
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to request changes');
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Request changes on ${workpack.id}`}
      description="The review feedback will be injected as a steering constraint hint for the agent, resetting the attempt counter to 1."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={requestMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={requestMutation.isPending}
            disabled={!comments.trim()}
          >
            Submit changes
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}

        <div className="text-[13px] text-on-surface-variant font-medium">
          Target: <span className="text-on-surface font-semibold">{workpack.title}</span>
        </div>

        <Field label="Feedback & required corrections" required hint="Specific instructions and requirements for the next attempt">
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={5}
              placeholder="Explain the issues found and what needs to be changed..."
              required
              autoFocus
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

