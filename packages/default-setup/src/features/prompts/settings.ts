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
            name: 'General',
            color: '#6B7280',
          },
          {
            name: 'Creative',
            color: '#A855F7',
          },
          {
            name: 'Technical',
            color: '#3B82F6',
          },
          {
            name: 'Analysis',
            color: '#10B981',
          },
          {
            name: 'Communication',
            color: '#F59E0B',
          },
        ]),
    })
    .strict(),
});
