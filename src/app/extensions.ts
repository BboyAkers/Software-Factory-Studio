import type { ComponentType } from 'react';
import { createStore, useStore } from '../api/state';

/**
 * Places the shell leaves open for the mock backend's tooling. The shell never imports `src/mocks`:
 * `main.tsx` registers the dev panel, the "Viewing as" switch and the persona sign-in here when mock mode
 * is on, so a build without mocks has no trace of them.
 */
interface Extensions {
  /** Rendered in the user menu, above Sign out. */
  userMenu: ComponentType<{ close: () => void }>[];
  /** Rendered once at the app root (the dev panel). */
  roots: ComponentType[];
  /** Replaces the default "Sign in" link on the signed-out screen. Call `onSignedIn` after setting a session. */
  signIn: ComponentType<{ onSignedIn: () => void }> | null;
}

const extensions = createStore<Extensions>({ userMenu: [], roots: [], signIn: null });

export function extendUserMenu(item: ComponentType<{ close: () => void }>): void {
  extensions.set((e) => (e.userMenu.includes(item) ? e : { ...e, userMenu: [...e.userMenu, item] }));
}

export function extendRoot(component: ComponentType): void {
  extensions.set((e) => (e.roots.includes(component) ? e : { ...e, roots: [...e.roots, component] }));
}

export function extendSignIn(component: ComponentType<{ onSignedIn: () => void }>): void {
  extensions.set((e) => ({ ...e, signIn: component }));
}

export const useExtensions = (): Extensions => useStore(extensions);
