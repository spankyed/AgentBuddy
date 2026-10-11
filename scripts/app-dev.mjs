// Repository-only entry point; load shared CLI internals through their TypeScript runtime.
import { tsImport } from 'tsx/esm/api';

const [operation, ...args] = process.argv.slice(2);
try {
  if (operation === 'open') {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`App contributor tool: run from the root of the apack source monorepo.

Usage: npm run dev:open -- [--app <checkout>] [--profile <name> | --fresh [--rm]] [--with-secrets]

Launch the built source app and hold its development session until Ctrl-C.
Defaults to this checkout; --app selects another apack source checkout.
Use npm run dev for source watchers and HMR.

Pack authors: run apack pack dev from your pack repository.`);
    } else {
      const { holdSession } = await tsImport('../packages/apack-cli/src/commands/dev.ts', import.meta.url);
      await holdSession(args, 'app');
    }
  } else if (operation === 'drive') {
    const { drive } = await tsImport('../packages/apack-cli/src/commands/drive.ts', import.meta.url);
    await drive(args);
  } else throw new Error('Use npm run dev:open or npm run dev:drive.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
