import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';
import { hotkeysSchema } from '../../app-settings/schema.ts';

export default defineFeatureSettings({
  visible: false,
  schema: z
    .object({
      hotkeys: hotkeysSchema.default({
        executeQuery: {
          key: 'Enter',
          modifiers: ['cmd'],
        },
      }),
    })
    .strict(),
});
