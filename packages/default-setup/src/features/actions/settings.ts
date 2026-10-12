import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: false,
  schema: z
    .object({
      categories: z
        .array(
          z
            .object({
              name: z.string(),
              color: z.string(),
            })
            .strict()
        )
        .default([
          {
            name: 'Utility',
            color: '#6B7280',
          },
          {
            name: 'Data Processing',
            color: '#3B82F6',
          },
          {
            name: 'Integration',
            color: '#10B981',
          },
          {
            name: 'Automation',
            color: '#F59E0B',
          },
          {
            name: 'Validation',
            color: '#EF4444',
          },
        ]),
    })
    .strict(),
});
