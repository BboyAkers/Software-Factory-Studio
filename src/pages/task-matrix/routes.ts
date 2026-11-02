import { z } from 'zod';
import { searchChoice, searchFlag, searchText } from '../../app/search';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'matrix/{-$wpId}';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({
  view: searchChoice(['board', 'table'], 'board'),
  archived: searchFlag(),
  agent: searchText(),
  priority: searchText(),
  epic: searchText(),
  q: searchText(),
});

export type Search = z.infer<typeof SearchSchema>;
