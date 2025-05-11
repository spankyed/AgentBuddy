import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  model: text('model').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
export const message = sqliteTable('message', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => session.id).notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
