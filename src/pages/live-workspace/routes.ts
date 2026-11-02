import { z } from 'zod';
import { searchText } from '../../app/search';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'workspace/{-$wpId}/{-$runId}';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({
  /** The open file, as a path in the workpack. */
  file: searchText(),
});

export type Search = z.infer<typeof SearchSchema>;
