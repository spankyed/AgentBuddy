import { installedEars, runQueryCode } from '@abuddy/sdk/database-console';

/**
 * Runs the console's query code (a function body that returns its result) with the read helpers
 * (`@abuddy/sdk/database-console`), and the installed packs' EARS: the console reads the whole database, so
 * `EARS.Entity` names every registered pack's entity types, as it does in `abuddy db`
 */
export function executeQuery(code: string): Promise<unknown> {
  return runQueryCode(code, { EARS: installedEars() });
}
