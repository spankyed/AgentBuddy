import { z } from 'zod';

/** Features name their own shortcuts; clearing one stores null. */
export const hotkeysSchema = z.record(
  z
    .object({
      key: z.string(),
      modifiers: z.array(z.string()),
      global: z.boolean().optional(),
    })
    .strict()
    .nullable()
);
