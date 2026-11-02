import { z } from 'zod';
import { RoleSchema } from './common';
import { ProjectSchema } from './settings';

export const MeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: RoleSchema,
  projects: z.array(ProjectSchema),
});
export type Me = z.infer<typeof MeSchema>;

export const SearchScopeSchema = z.enum(['epics', 'workpacks', 'files', 'logs']);
export type SearchScope = z.infer<typeof SearchScopeSchema>;

export const SearchResultSchema = z.object({
  scope: SearchScopeSchema,
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  /** Deep link target, relative to `/p/:project`. */
  to: z.string(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(SearchResultSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
