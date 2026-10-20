import { z } from 'zod';

/** Development conventions a pack may allow; runtime contract checks remain mandatory. */
export const ALLOWABLE_PACK_CHECKS = [
  'cross-feature-imports', 'untyped-sends', 'raw-transport', 'backend-console', 'repository-casts',
] as const;

export const PackChecksSchema = z.object({
  allow: z.array(z.enum(ALLOWABLE_PACK_CHECKS)).describe('Development conventions explicitly allowed by this pack; all other checks remain enabled.').optional(),
}).strict().describe('Build-time source-check policy; does not change runtime permissions.');
