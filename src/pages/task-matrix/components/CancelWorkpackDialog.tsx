import { useState } from 'react';
import type { Workpack } from '../../../contracts';
import { useCancelWorkpack } from '../../../api/mutations';
import { Banner, Button, Dialog } from '../../../components/ui';

export interface CancelWorkpackDialogProps {
  open: boolean;
  workpack: Workpack | null;
  onClose: () => void;
}

export function CancelWorkpackDialog({ open, workpack, onClose }: CancelWorkpackDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const cancelMutation = useCancelWorkpack();

  if (!workpack) return null;

  const handleCancel = () => {
    setError(null);
    cancelMutation.mutate(
      { id: workpack.id, version: workpack.version },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to cancel workpack');
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Cancel ${workpack.id}?`}
      description="Cancelling terminates all active synthesis and verification runs for this workpack."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={cancelMutation.isPending}>
            Keep running
          </Button>
          <Button
            variant="danger"
            onClick={handleCancel}
            loading={cancelMutation.isPending}
          >
            Cancel workpack
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Banner tone="danger">{error}</Banner>}

        <p className="text-[13px] text-on-surface leading-5">
          Are you sure you want to cancel <strong className="text-on-surface font-semibold">{workpack.title}</strong>?
        </p>

        <div className="rounded border border-fluent-border bg-surface-sunken p-3 text-[12px] text-on-surface-variant leading-5">
          <p className="font-semibold text-on-surface">Branch and PR will remain open</p>
          <p className="mt-1">
            The git branch <code className="text-brand font-mono">{workpack.branch}</code> and any opened pull request will stay preserved for manual inspection, debugging, or pickup.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

