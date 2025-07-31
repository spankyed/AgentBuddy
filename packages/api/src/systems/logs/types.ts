import { z } from 'zod';

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevel>;

export const LogEntry = z.object({
  id: z.string(),
  timestamp: z.number(),
  level: LogLevel,
  message: z.string(),
  source: z.string().optional(),
  meta: z.record(z.any()).optional(),
  stack: z.string().optional(),
});

export type LogEntry = z.infer<typeof LogEntry>;

export interface LogsState {
  logs: LogEntry[];
  maxLogs: number;
} 