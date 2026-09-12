import { execFileSync } from 'node:child_process';
import { parseTargetEnv, TARGET_ENV_USAGE } from '../utils';

const HELP = `
Usage: abuddy open [-b]

Open the installed AgentBuddy app (or bring it to the front if it is running).

Options:
  ${TARGET_ENV_USAGE}
`.trim();

// Product names from electron-builder.mjs
const PRODUCT_NAMES = {
  production: 'AgentBuddy',
  beta: 'AgentBuddy Beta',
} as const;

export async function open(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const { env } = parseTargetEnv(args);
  if (env !== 'production' && env !== 'beta') {
    throw new Error('There is no installed dev app. Run `npm start` in the AgentBuddy repo instead.');
  }
  if (process.platform !== 'darwin') {
    throw new Error(`abuddy open is only supported on macOS (current platform: ${process.platform}).`);
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
