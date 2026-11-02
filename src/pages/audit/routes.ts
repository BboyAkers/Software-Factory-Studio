import { z } from 'zod';
import { searchText } from '../../app/search';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'audit';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({
  workpack: searchText(),
  actor: searchText(),
  action: searchText(),
  since: searchText(),
  until: searchText(),
});

export type Search = z.infer<typeof SearchSchema>;
