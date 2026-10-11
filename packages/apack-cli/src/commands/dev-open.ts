import { holdSession } from './dev';

export async function devOpen(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: apack dev open [--app <checkout>] [--profile <name> | --fresh [--rm]] [--with-secrets]

Launch a built checkout with development debugging enabled and hold it until Ctrl-C.
Uses the checkout behind the current directory unless --app names one.
No source watchers run. Use npm run dev in the app repository for HMR.
Installed production, beta and preview apps never gain a debugging connection.`);
    return;
  }
  return holdSession(args, 'app');
}
