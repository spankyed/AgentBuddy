import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: false,
  schema: z
    .object({
      showBookmarksBar: z.boolean().default(true),
      openLinksInApp: z.boolean().default(true),
    })
    .strict(),
});
