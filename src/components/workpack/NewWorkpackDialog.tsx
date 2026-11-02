import type { NewWorkpackPreset } from '../../app/ui';
import { Button, Dialog } from '../ui';

/** Placeholder: the New workpack dialog (spec §16.6) replaces this file. Keep the props. */
export function NewWorkpackDialog({ open, preset: _preset, onClose }: { open: boolean; preset: NewWorkpackPreset; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="New workpack" footer={<Button onClick={onClose}>Close</Button>}>
      <p className="text-[13px] text-on-surface-variant">The workpack form is being built.</p>
    </Dialog>
  );
}
