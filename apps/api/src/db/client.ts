import * as schema from './schema';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const sqlite = new Database(process.env.DB_URL ?? './dev.db');
export const db = drizzle(sqlite, { schema });

// Run migrations automatically in dev
if (process.env.NODE_ENV !== 'production') {
//   migrate(sqlite, { migrationsFolder: 'drizzle' });
}

export { schema };