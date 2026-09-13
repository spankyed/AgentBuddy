import { withoutSourceCondition } from '@abuddy/host/build/source-resolution';

/**
 * Env for the Electron app under test. The app-bundled `abuddy` runs on the app's own
 * runtime with ELECTRON_RUN_AS_NODE=1; inherited here it would start Electron as plain Node.
 * The runner's @abuddy/source condition isn't passed on: a checkout's app sets its own.
 */
export function appLaunchEnv(base: NodeJS.ProcessEnv, userDataDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  const nodeOptions = withoutSourceCondition(env.NODE_OPTIONS);
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;
  env.PLAYWRIGHT_TEST = 'true';
  env.ABUDDY_USER_DATA_DIR = userDataDir;
  return env;
}
