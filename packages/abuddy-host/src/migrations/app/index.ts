// The host's own app migrations: they move the app's state, which no pack owns. Listed in version order;
// runAppMigrations() runs them before the built-in packs' migrations.
import type { PackMigration } from '@abuddy/sdk/framework';
import type { PackRegistry } from '../../packs/pack-registration.ts';
import { migration as m0315, type InstalledManifests } from './0.3.15.ts';

/** The host's app migrations, over the app's registered packs and, unless given, the packs installed on disk */
export const appMigrations = (registry: PackRegistry, installed?: InstalledManifests): PackMigration[] => [m0315(registry, installed)];
