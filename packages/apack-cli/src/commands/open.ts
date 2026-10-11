import { execFileSync } from 'node:child_process';
import { parseReleaseChannel } from '../utils';

const HELP = `
Usage: apack open [--channel production|beta|preview]

Open the installed app or bring it to the front. Production is the default.
Debugging is disabled. For an attachable checkout, use apack dev open.

Options:
  --channel <name>  production (default), beta, preview
`.trim();

// Product names from electron-builder.mjs
const PRODUCT_NAMES = {
  production: 'apack',
  beta: 'apack Beta',
  preview: 'apack Preview',
} as const;

export async function open(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const { env, args: rest } = parseReleaseChannel(args);
  if (rest.length) throw new Error('Unexpected arguments. Use apack open --help; development sessions use apack dev open.');
  if (env !== 'production' && env !== 'beta' && env !== 'preview') {
    throw new Error('There is no installed dev app. Run `npm run dev` in the apack repo instead.');
  }
  if (process.platform !== 'darwin') {
    throw new Error(`apack open is only supported on macOS (current platform: ${process.platform}).`);
  }

  const appName = PRODUCT_NAMES[env];
  try {
    // -a resolves the app through Launch Services, wherever it is installed
    execFileSync('open', ['-a', appName], { stdio: 'pipe' });
  } catch {
    throw new Error(`Could not open "${appName}". Is it installed?`);
  }
  console.log(`Opened ${appName}`);
}
