import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

export default defineFeatureSettings({
  visible: false,
  schema: z.object({ listTitle: z.string().default('Memos') }).strict(),
});
