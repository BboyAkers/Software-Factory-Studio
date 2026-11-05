import { Button, Dialog, Icon } from '../../../components/ui';

interface PauseGitHubConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function PauseGitHubConfirmDialog({ open, onClose, onConfirm, loading = false }: PauseGitHubConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={!loading}
      title={
        <span className="flex items-center gap-2 text-fluent-danger-text">
          <Icon name="warning" size={20} />
          <span>Pause GitHub Integration</span>
        </span>
      }
      description="Temporarily halt source synchronization and agent execution."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            Pause GitHub Connector
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] leading-5 text-on-surface-variant">
        <p>
          Pausing the GitHub connector will immediately <strong className="text-white">pause all active workpacks</strong> targeting this repository with the reason <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-white">integration-disabled</code>.
        </p>
        <p>
          Webhook events from GitHub will be ignored until GitHub is re-enabled. When you resume the integration, active workpacks will automatically unpause in priority order (P0 blockers first).
        </p>
      </div>
    </Dialog>
  );
}
