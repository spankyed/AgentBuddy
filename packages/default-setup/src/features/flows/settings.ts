import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: false,
  schema: z
    .object({
      enableFlowPreview: z.boolean().default(true),
    })
    .strict(),
});
