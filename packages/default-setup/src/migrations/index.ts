import type { PackMigration } from '@abuddy/sdk/framework';

import { migration as m010 } from './0.1.0';
import { migration as m020 } from './0.2.0';
import { migration as m023 } from './0.2.3';
import { migration as m024 } from './0.2.4';
import { migration as m025 } from './0.2.5';
import { migration as m027 } from './0.2.7';
import { migration as m029 } from './0.2.9';
import { migration as m0220 } from './0.2.20';
import { migration as m0222 } from './0.2.22';
import { migration as m030 } from './0.3.0';
import { migration as m031 } from './0.3.1';
import { migration as m0313 } from './0.3.13';
import { migration as m0314 } from './0.3.14';

export const migrations: PackMigration[] = [m010, m020, m023, m024, m025, m027, m029, m0220, m0222, m030, m031, m0313, m0314];
