import { z } from 'zod';
import { searchChoice } from '../../app/search';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'overview';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({
  window: searchChoice(['24h', '7d'], '24h'),
});

export type Search = z.infer<typeof SearchSchema>;
