import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: false,
  schema: z
    .object({
      maxLogs: z.number().int().min(100).max(10000).default(1000),
      excludedSources: z.array(z.string()).default([]),
      showAppEvents: z.boolean().default(false),
    })
    .strict(),
});
