import { execFileSync } from 'node:child_process';
import { parseAppChannel } from '../utils';
import { PRODUCT_NAMES } from '../app/channels';

const HELP = `
Usage: apack open [--channel production|beta|preview]

Open the installed app or bring it to the front. Production is the default.
Debugging is disabled.

Options:
  --channel <name>  production (default), beta, preview
`.trim();

export async function open(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const { channel, args: rest } = parseAppChannel(args);
  if (rest.length) throw new Error('Unexpected arguments. Use apack open --help.');
  if (process.platform !== 'darwin') {
    throw new Error(`apack open is only supported on macOS (current platform: ${process.platform}).`);
  }

  const appName = PRODUCT_NAMES[channel];
  try {
    // -a resolves the app through Launch Services, wherever it is installed
    execFileSync('open', ['-a', appName], { stdio: 'pipe' });
  } catch {
    throw new Error(`Could not open "${appName}". Is it installed?`);
  }
  console.log(`Opened ${appName}`);
}
