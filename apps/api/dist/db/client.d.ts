import * as schema from './schema';
import Database from 'better-sqlite3';
export declare const db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof schema> & {
    $client: Database.Database;
};
export { schema };
//# sourceMappingURL=client.d.ts.map