import type { Role } from '../contracts';
import type { Actor } from './backend/store';

/** The four people the mock backend knows. The dev panel's "Viewing as" switch picks one. */
export interface Persona {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const PERSONAS: Record<Role, Persona> = {
  viewer: { id: 'u-priya', name: 'Priya Nair', email: 'priya.nair@example.dev', role: 'viewer' },
  engineer: { id: 'u-jonas', name: 'Jonas Weber', email: 'jonas.weber@example.dev', role: 'engineer' },
  maintainer: { id: 'u-mira', name: 'Mira Okafor', email: 'mira.okafor@example.dev', role: 'maintainer' },
  admin: { id: 'u-austin', name: 'Austin Akers', email: 'austin.akers@example.dev', role: 'admin' },
};

export const DEFAULT_ROLE: Role = 'admin';

/** The bearer token the client sends: `mock:<role>:<userId>:<url-encoded name>` (spec Appendix H). */
export const mockToken = (persona: Persona): string => `mock:${persona.role}:${persona.id}:${encodeURIComponent(persona.name)}`;

export const actorOf = (persona: Persona): Actor => ({ id: persona.id, name: persona.name, role: persona.role, type: 'user' });
