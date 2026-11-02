import { sessionStore, setSessionToken } from '../api/state';
import { extendRoot, extendSignIn, extendUserMenu } from '../app/extensions';
import { DevPanel } from './DevPanel';
import { parseMockToken } from './http';
import { DEFAULT_ROLE, PERSONAS, mockToken, startMocks } from './index';
import { PersonaSignIn, RoleSwitcher } from './PersonaPicker';

/**
 * Everything mock mode adds, in one place so `main.tsx` has a single dynamic import to guard: the simulated
 * backend, a session as the default persona (a persona picked earlier is kept), and the tooling the shell
 * leaves slots for. A build with `VITE_USE_MOCKS=false` never loads this file.
 */
export async function bootMocks(): Promise<void> {
  const control = await startMocks();
  if (!parseMockToken(sessionStore.get().token)) setSessionToken(mockToken(PERSONAS[DEFAULT_ROLE]));

  extendRoot(() => <DevPanel control={control} />);
  extendUserMenu(RoleSwitcher);
  extendSignIn(PersonaSignIn);
}
