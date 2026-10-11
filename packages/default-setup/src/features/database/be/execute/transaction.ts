import { installedEars, runTransactionCode } from '@apack/sdk/database-console';

/**
 * Runs the console's transaction code (a function body that returns its result) with the read and write helpers
 * (`@apack/sdk/database-console`), and the installed packs' EARS, as `apack db exec` runs it
 */
export function executeTransaction(code: string): Promise<unknown> {
  return runTransactionCode(code, { EARS: installedEars() });
}
