import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: false,
  schema: z
    .object({
      tags: z
        .array(
          z
            .object({
              name: z.string(),
              color: z.string().optional(),
            })
            .strict()
        )
        .default([
          {
            name: 'Reference',
            color: '#3B82F6',
          },
          {
            name: 'Tutorial',
            color: '#10B981',
          },
          {
            name: 'Template',
            color: '#A855F7',
          },
          {
            name: 'Research',
            color: '#F59E0B',
          },
          {
            name: 'Archive',
            color: '#6B7280',
          },
          {
            name: 'Important',
            color: '#EF4444',
          },
        ]),
    })
    .strict(),
});
