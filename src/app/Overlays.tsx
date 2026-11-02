import { BudgetModal } from '../components/budget/BudgetModal';
import { CommandPalette } from '../components/palette/CommandPalette';
import { NewWorkpackDialog } from '../components/workpack/NewWorkpackDialog';
import { ui, useUi } from './ui';

/**
 * The overlays any page can open through `ui` (`ui.openBudget()`, `ui.openPalette()`,
 * `ui.openNewWorkpack(preset)`). Rendered once by the shell, so a page never mounts its own copy.
 */
export function Overlays() {
  const { budgetOpen, paletteOpen, newWorkpack } = useUi();
  return (
    <>
      <BudgetModal open={budgetOpen} onClose={ui.closeBudget} />
      <CommandPalette open={paletteOpen} onClose={ui.closePalette} />
      <NewWorkpackDialog open={newWorkpack.open} preset={newWorkpack.preset} onClose={ui.closeNewWorkpack} />
    </>
  );
}
