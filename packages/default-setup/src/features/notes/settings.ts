import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: false,
  schema: z
    .object({
      tasklistPanelPosition: z.enum(['left', 'right']).default('left'),
      showCollapseIcon: z.boolean().default(true),
    })
    .strict(),
});
