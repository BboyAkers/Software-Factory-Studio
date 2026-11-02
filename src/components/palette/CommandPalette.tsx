import { Button, Dialog } from '../ui';

/** Placeholder: the command palette (spec §16.14) replaces this file. Keep the props. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Search" footer={<Button onClick={onClose}>Close</Button>}>
      <p className="text-[13px] text-on-surface-variant">The command palette is being built.</p>
    </Dialog>
  );
}
