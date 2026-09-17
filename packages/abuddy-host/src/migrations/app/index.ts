// The host's own app migrations: they move the app's state, which no pack owns. Listed in version order;
// runAppMigrations() runs them before the built-in packs' migrations.
import type { PackMigration } from '@abuddy/sdk/framework';
import type { PackRegistry } from '../../packs/pack-registration.ts';
import { migration as m0315 } from './0.3.15.ts';

/** The host's app migrations, over the app's registered packs */
export const appMigrations = (registry: PackRegistry): PackMigration[] => [m0315(registry)];
