import { uuid } from "drizzle-orm/gel-core";
import { LogEntry } from "@/systems/logs/types";

const mockLogs: LogEntry[] = [
  {
    id: uuid() + '',
    timestamp: Date.now() - 10000,
    level: 'info',
    message: 'Application started successfully',
    source: 'backend',
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 9000,
    level: 'debug',
    message: 'Connecting to database...',
    source: 'database',
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 8500,
    level: 'info',
    message: 'Database connection established',
    source: 'database',
    meta: {
      host: 'localhost',
      port: 5432,
      database: 'agentbuddy'
    }
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 7000,
    level: 'info',
    message: 'Starting agent system',
    source: 'agent',
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 6000,
    level: 'warn',
    message: 'Rate limit approaching threshold',
    source: 'api',
    meta: {
      current: 85,
      limit: 100,
      resetIn: '5 minutes'
    }
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 5000,
    level: 'error',
    message: 'Failed to fetch user preferences',
    source: 'api',
    stack: `Error: Failed to fetch user preferences
  at fetchUserPreferences (/app/src/api/user.ts:45:11)
  at async handleRequest (/app/src/api/handler.ts:23:5)
  at async processRequest (/app/src/server.ts:156:3)`,
    meta: {
      userId: 'user-123',
      endpoint: '/api/preferences'
    }
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 4000,
    level: 'info',
    message: 'Retrying user preferences fetch...',
    source: 'api',
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 3500,
    level: 'info',
    message: 'Successfully fetched user preferences on retry',
    source: 'api',
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 2000,
    level: 'debug',
    message: 'Processing message from user',
    source: 'agent',
    meta: {
      messageId: 'msg-456',
      wordCount: 42
    }
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 1000,
    level: 'info',
    message: 'Generated response in 234ms',
    source: 'agent',
  },
  {
    id: uuid() + '',
    timestamp: Date.now() - 500,
    level: 'warn',
    message: 'Memory usage above 80%',
    source: 'system',
    meta: {
      used: '1.6GB',
      total: '2GB',
      percentage: 82
    }
  },
];
