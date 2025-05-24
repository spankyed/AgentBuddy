import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  model: text('model').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const message = sqliteTable('message', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => session.id),
  sender: text('sender', { enum: ['user', 'assistant', 'system'] }).notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});