import { z } from 'zod';
import { searchText } from '../../app/search';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'settings';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({
  /** The section to scroll to or open, such as `connect`. */
  section: searchText(),
});

export type Search = z.infer<typeof SearchSchema>;
