// Writes src/packs/runtime/shared-modules.ts (see src/build/shared-modules.ts)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderSharedModules } from '../src/build/shared-modules.ts';

const file = path.resolve(import.meta.dirname, '..', 'src', 'packs', 'runtime', 'shared-modules.ts');
fs.writeFileSync(file, renderSharedModules(import.meta.filename));
console.log(`Wrote ${path.relative(process.cwd(), file)}`);
