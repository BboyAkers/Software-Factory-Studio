import { useQueryClient } from '@tanstack/react-query';
import { setSessionToken } from '../api/state';
import { useSession } from '../app/session';
import { ROLE_LABEL } from '../domain/rbac';
import { Avatar, Badge, cx } from '../components/ui';
import { initialsOf } from '../components/shell/UserMenu';
import { PERSONAS, mockToken, type Persona } from './personas';

const ORDER = [PERSONAS.viewer, PERSONAS.engineer, PERSONAS.maintainer, PERSONAS.admin];

/** The four people the mock backend knows, one per role. Picking one swaps the bearer token. */
export function PersonaList({ currentId, onPick }: { currentId: string | undefined; onPick: (persona: Persona) => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {ORDER.map((persona) => {
        const current = persona.id === currentId;
        return (
          <li key={persona.id}>
            <button
              type="button"
              aria-pressed={current}
              onClick={() => onPick(persona)}
              className={cx(
                'focus-ring flex w-full items-center gap-2.5 rounded-md border px-2 py-1.5 text-left text-[13px] transition-colors duration-150',
                current ? 'border-primary/40 bg-primary-subtle' : 'border-transparent hover:bg-white/6',
              )}
            >
              <Avatar initials={initialsOf(persona.name)} size={24} />
              <span className="min-w-0 flex-1 truncate text-on-surface">{persona.name}</span>
              <Badge tone={current ? 'info' : 'neutral'}>{ROLE_LABEL[persona.role]}</Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Switch persona without leaving the page: every query refetches, so each control re-evaluates the new role. */
export function useSwitchPersona(): (persona: Persona) => void {
  const client = useQueryClient();
  return (persona) => {
    setSessionToken(mockToken(persona));
    void client.invalidateQueries();
  };
}

/** "Viewing as" inside the user menu (spec §16.3). */
export function RoleSwitcher({ close }: { close: () => void }) {
  const { user } = useSession();
  const switchTo = useSwitchPersona();
  return (
    <div className="border-t border-fluent-border px-3 py-3" role="group" aria-label="Viewing as">
      <p className="mb-1.5 px-1 text-[12px] font-semibold text-on-surface-variant">Viewing as</p>
      <PersonaList
        currentId={user?.id}
        onPick={(persona) => {
          switchTo(persona);
          close();
        }}
      />
    </div>
  );
}

/** Replaces the signed-out screen's "Sign in" link in mock mode. */
export function PersonaSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  return (
    <div className="text-left">
      <p className="mb-2 text-center text-[12px] text-on-surface-variant">Sign in as</p>
      <PersonaList
        currentId={undefined}
        onPick={(persona) => {
          setSessionToken(mockToken(persona));
          onSignedIn();
        }}
      />
    </div>
  );
}
