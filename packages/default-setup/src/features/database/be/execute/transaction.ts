import { runTransactionCode } from '@abuddy/sdk/database-console';
import { EARS } from '@/__generated__/ears';

/**
 * Runs the console's transaction code (a function body that returns its result) with the read and write helpers
 * (`@abuddy/sdk/database-console`), and this pack's EARS
 */
export function executeTransaction(code: string): Promise<unknown> {
  return runTransactionCode(code, { EARS });
}
