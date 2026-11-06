import { useEffect, useState } from 'react';
import type { Contract } from '../../../contracts';
import { useUnlockContract } from '../../../api/mutations';
import { Banner, Button, Dialog, Field, Textarea } from '../../../components/ui';

export interface UnlockContractDialogProps {
  open: boolean;
  contract: Contract | null;
  workpackId: string;
  onClose: () => void;
}

export function UnlockContractDialog({ open, contract, workpackId, onClose }: UnlockContractDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unlockMutation = useUnlockContract();

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  if (!contract) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }

    unlockMutation.mutate(
      {
        contractId: contract.id,
        workpackId,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to unlock contract');
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Unlock contract: ${contract.path}`}
      description="Unlocking allows modifying contract specifications for this workpack. An audit trail entry is permanently recorded."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={unlockMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={unlockMutation.isPending}
            disabled={reason.trim().length < 10}
          >
            Confirm unlock
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}

        <div className="text-[12px] font-mono text-on-surface-variant bg-surface-sunken p-2.5 rounded border border-fluent-border">
          Type: <strong className="text-on-surface">{contract.kind}</strong> · Hash: <span className="text-brand">{contract.hash.slice(0, 12)}</span>
        </div>

        <Field label="Reason for unlock" required hint="At least 10 characters. Stored in project audit trail.">
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why the contract must be altered during synthesis..."
              required
              minLength={10}
              autoFocus
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

