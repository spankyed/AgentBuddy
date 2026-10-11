import { withoutSourceCondition } from '@apack/host/build/source-resolution';

/**
 * Env for the Electron app under test. The app-bundled `apack` runs on the app's own
 * runtime with ELECTRON_RUN_AS_NODE=1; inherited here it would start Electron as plain Node.
 * The runner's @apack/source condition isn't passed on: a checkout's app sets its own.
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
  env.APACK_USER_DATA_DIR = userDataDir;
  return env;
}

/**
 * Whether to pin the page's viewport, which is a question about whether anyone is looking at the window.
 *
 * Pinned, layout and `toHaveScreenshot` baselines are the same everywhere, which a suite needs because the
 * main window's default size depends on whether main was built in dev or production mode.
 *
 * **But Playwright emulates a viewport inside the real window rather than resizing it.** With the window
 * shown, the app renders into the top-left 1400x900 and the rest of the window stays empty, showing the
 * desktop through it — which is what `npm run drive` looked like, and reads as a broken app rather than a
 * pinned one. So a run that shows its windows keeps the window's own size, and a run nobody watches keeps
 * the determinism.
 */
export const pinsViewport = (env: NodeJS.ProcessEnv): boolean => env.PLAYWRIGHT_VISIBLE !== '1';
