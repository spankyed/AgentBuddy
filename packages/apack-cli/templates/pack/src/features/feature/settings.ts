import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: true,
  schema: z.object({}).strict(),
});
