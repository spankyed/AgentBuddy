import { runQueryCode } from '@abuddy/sdk/database-console';
import { EARS } from '@/__generated__/ears';

/**
 * Runs the console's query code (a function body that returns its result) with the read helpers
 * (`@abuddy/sdk/database-console`), and this pack's EARS
 */
export function executeQuery(code: string): Promise<unknown> {
  return runQueryCode(code, { EARS });
}
