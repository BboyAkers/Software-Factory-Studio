import { z } from 'zod';
import { searchText } from '../../app/search';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'fleet/{-$agentId}';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({
  /** The open tab of the tuning drawer. */
  tab: searchText(),
});

export type Search = z.infer<typeof SearchSchema>;
