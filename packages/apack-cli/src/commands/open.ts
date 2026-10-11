import { execFileSync } from 'node:child_process';
import { parseTargetEnv, TARGET_ENV_USAGE } from '../utils';

const HELP = `
Usage: apack open [-b]
       apack open --session [--build <name|path>] [--profile <name> | --fresh [--rm]] [--with-secrets]

Open the installed apack app (or bring it to the front if it is running).
--session launches or attaches to a development app and holds it until Ctrl-C.
It never builds, installs, or watches a pack. With no --build, it uses a linked
checkout or the newest beta. Use npm run dev for app source watchers.

Options:
  ${TARGET_ENV_USAGE}
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

  if (args.includes('--session')) {
    const { holdSession } = await import('./dev');
    return holdSession(args.filter(arg => arg !== '--session'), 'app');
  }
  const { env, args: rest } = parseTargetEnv(['--production', ...args]);
  if (rest.length) throw new Error('Unexpected arguments. Use apack open --help; session flags require --session.');
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
