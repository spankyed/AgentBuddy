import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';

// The host stores this slice under e2e-fixture/notes, independently of default-setup/notes.
export default defineFeatureSettings({
  schema: z.object({ listTitle: z.string().default('Fixture Notes') }).strict(),
});
