import { createStore, useStore } from '../api/state';

/** Starting values for the New workpack dialog, set when it is opened from an Epic or another workpack. */
export interface NewWorkpackPreset {
  epicId?: string;
  title?: string;
  dependsOn?: string[];
  targetFiles?: string[];
}

interface UiState {
  budgetOpen: boolean;
  paletteOpen: boolean;
  /** The off-canvas navigation below 640 px. */
  navOpen: boolean;
  newWorkpack: { open: boolean; preset: NewWorkpackPreset };
}

export const uiStore = createStore<UiState>({
  budgetOpen: false,
  paletteOpen: false,
  navOpen: false,
  newWorkpack: { open: false, preset: {} },
});

const patch = (change: Partial<UiState>) => uiStore.set((s) => ({ ...s, ...change }));

/**
 * Overlays that any page may open. The shell renders them once (`src/app/Overlays.tsx`), so a page never
 * mounts its own copy of the Budget modal, the command palette or the New workpack dialog.
 */
export const ui = {
  openBudget: () => patch({ budgetOpen: true }),
  closeBudget: () => patch({ budgetOpen: false }),
  openPalette: () => patch({ paletteOpen: true }),
  closePalette: () => patch({ paletteOpen: false }),
  togglePalette: () => uiStore.set((s) => ({ ...s, paletteOpen: !s.paletteOpen })),
  openNav: () => patch({ navOpen: true }),
  closeNav: () => patch({ navOpen: false }),
  openNewWorkpack: (preset: NewWorkpackPreset = {}) => patch({ newWorkpack: { open: true, preset } }),
  closeNewWorkpack: () => uiStore.set((s) => ({ ...s, newWorkpack: { ...s.newWorkpack, open: false } })),
};

export const useUi = (): UiState => useStore(uiStore);
