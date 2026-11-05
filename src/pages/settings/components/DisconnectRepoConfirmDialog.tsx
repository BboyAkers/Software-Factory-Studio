import { Button, Dialog, Icon } from '../../../components/ui';

interface DisconnectRepoConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  repoName: string;
  loading?: boolean;
}

export function DisconnectRepoConfirmDialog({
  open,
  onClose,
  onConfirm,
  repoName,
  loading = false,
}: DisconnectRepoConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={!loading}
      title={
        <span className="flex items-center gap-2 text-fluent-danger-text">
          <Icon name="link_off" size={20} />
          <span>Disconnect Repository</span>
        </span>
      }
      description="Remove this repository connection from Software Factory Studio."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" icon="link_off" onClick={onConfirm} loading={loading}>
            Disconnect &amp; Remove
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] leading-5 text-on-surface-variant">
        <p>
          Are you sure you want to disconnect <strong className="text-white font-mono">{repoName}</strong>?
        </p>
        <div className="rounded-md border border-fluent-danger/30 bg-fluent-danger/10 p-3 text-[12px] text-white">
          <div className="flex items-start gap-2">
            <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-fluent-danger-text" />
            <div className="space-y-1">
              <p className="font-semibold text-fluent-danger-text">This action removes the project binding:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-on-surface-variant">
                <li>Active workpacks and autonomous agent swarms will be halted.</li>
                <li>Webhook deliveries for this repository will no longer be routed.</li>
                <li>The project will be removed from your available repositories list.</li>
              </ul>
            </div>
          </div>
        </div>
        <p className="text-[12px] text-on-surface-muted">
          Your source code and Git history on GitHub are unaffected. You can reconnect this repository at any time.
        </p>
      </div>
    </Dialog>
  );
}
