import { installedEars, runTransactionCode } from '@abuddy/sdk/database-console';

/**
 * Runs the console's transaction code (a function body that returns its result) with the read and write helpers
 * (`@abuddy/sdk/database-console`), and the installed packs' EARS, as `abuddy db exec` runs it
 */
export function executeTransaction(code: string): Promise<unknown> {
  return runTransactionCode(code, { EARS: installedEars() });
}
