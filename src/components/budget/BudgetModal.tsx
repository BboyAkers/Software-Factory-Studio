import { Button, Dialog } from '../ui';

/** Placeholder: the Budget modal (spec §16.11) replaces this file. Keep the props. */
export function BudgetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Budget" footer={<Button onClick={onClose}>Close</Button>}>
      <p className="text-[13px] text-on-surface-variant">The budget editor is being built.</p>
    </Dialog>
  );
}
