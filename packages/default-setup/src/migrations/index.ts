import type { PackMigration } from '@abuddy/sdk/framework';

import { migration as m030 } from './0.3.0.ts';
import { migration as m031 } from './0.3.1.ts';
import { migration as m0314 } from './0.3.14.ts';
import { migration as m0315 } from './0.3.15.ts';

export const migrations: PackMigration[] = [m030, m031, m0314, m0315];
