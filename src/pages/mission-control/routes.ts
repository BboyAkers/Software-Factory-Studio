import { z } from 'zod';
import { searchText } from '../../app/search';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'mission/{-$wpId}/{-$runId}';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({
  /** Limits the stepper and the list to one Epic. */
  epic: searchText(),
});

export type Search = z.infer<typeof SearchSchema>;
