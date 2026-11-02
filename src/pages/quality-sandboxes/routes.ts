import { z } from 'zod';

/** Path below `/p/$project`. Optional params open a drawer or focus an item. */
export const path = 'quality/{-$wpId}';

/** Every field has a fallback, so a hand-edited URL never breaks the page. */
export const SearchSchema = z.object({});

export type Search = z.infer<typeof SearchSchema>;
