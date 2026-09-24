// The logs plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { PluginInbox } from '@abuddy/sdk/fe'
import type { LogEntry } from '../be/types'

export interface LogsContext {
  logs: LogEntry[];
  filter: {
    level: 'all' | 'debug' | 'info' | 'warn' | 'error';
    search: string;
  };
  settings: {
    maxLogs: number;
    excludedSources: string[];
    showAppEvents?: boolean;
  };
}

/** A log line any pack's system may hand the logs plugin */
export type LogsInboxEvent = { type: 'LOG_ADDED'; log: LogEntry }

// `public`, alone among this pack's plugins: a log line is the one thing a dependent pack has business sending,
// and the logs system doesn't send it — whoever logged it does.
export type Contract = {
  state: LogsContext
  inbox: PluginInbox<{ public: LogsInboxEvent }>
}
