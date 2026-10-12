import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withCheckoutProfile } from './lib/dev-profile.mjs';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const bin = fileURLToPath(new URL('../packages/apack-cli/bin/apack.mjs', import.meta.url));
process.chdir(root);
process.argv = [process.execPath, bin, 'db', ...withCheckoutProfile(root, process.argv.slice(2))];
// Run the CLI in this process so interactive input, signals and exit status need no forwarding wrapper.
await import(pathToFileURL(bin).href);
