import type {LogsSurfaceState} from '../../agentbuddy-ui/logs/logTypes';
import {textReveal} from './timeline';

const now = Date.parse('2026-05-25T14:35:16Z');

export const logsSurfaceState: LogsSurfaceState = {
  copied: false,
  expandedContent: {
    'log-release-run': 'meta',
    'log-render-error': 'stack',
  },
  filterLevel: 'all',
  logs: [
    {
      id: 'log-release-run',
      level: 'info',
      message: 'Release workflow started for AgentBuddy launch film',
      meta: {
        flowId: 'release-automation',
        removed: ['anti-gravity', 'cursor', 'vscode', 'notion', 'obsidian', 'tick-tick'],
        steps: ['capture context', 'render demos', 'publish assets'],
      },
      source: 'flows',
      timestamp: now,
    },
    {
      id: 'log-query',
      level: 'debug',
      message: 'Database query completed in 42.18ms',
      meta: {
        entity: 'Thread',
        count: 4,
        selector: "where('status', 'active')",
      },
      source: 'database',
      timestamp: now - 8_000,
    },
    {
      id: 'log-actions',
      level: 'info',
      message: 'Action template "Publish launch report" saved',
      source: 'actions',
      timestamp: now - 19_000,
    },
    {
      id: 'log-render-warning',
      level: 'warn',
      message: 'Render cache was rebuilt after stale webpack pack was detected',
      meta: {
        cache: 'remotion-production',
        recovered: true,
      },
      source: 'video',
      timestamp: now - 28_000,
    },
    {
      id: 'log-render-error',
      level: 'error',
      message: 'Failed to publish draft asset on first attempt',
      source: 'publisher',
      stack: `Error: Upload failed with status 503
at publishAsset (publisher.ts:88:11)
at async runReleaseWorkflow (release.ts:141:5)
at async executeFlow (flows.ts:220:3)`,
      timestamp: now - 37_000,
    },
    {
      id: 'log-app-event',
      level: 'debug',
      message: 'Plugin selected: logs',
      source: 'app-events',
      timestamp: now - 51_000,
    },
  ],
  searchTerm: '',
  settings: {
    excludedSources: ['debug:verbose'],
    maxLogs: 1000,
    showAppEvents: true,
  },
};

export const logsFilteredState: LogsSurfaceState = {
  ...logsSurfaceState,
  expandedContent: {},
  filterLevel: 'error',
  searchTerm: 'publish',
};

export const logsEmptyState: LogsSurfaceState = {
  ...logsSurfaceState,
  expandedContent: {},
  filterLevel: 'all',
  logs: [],
  searchTerm: '',
  settings: {
    excludedSources: [],
    maxLogs: 1000,
    showAppEvents: false,
  },
};

export const logsNoMatchingState: LogsSurfaceState = {
  ...logsSurfaceState,
  expandedContent: {},
  filterLevel: 'error',
  searchTerm: 'database',
};

export const logsContextMenuState: LogsSurfaceState = {
  ...logsSurfaceState,
  contextMenu: {
    source: 'database',
    visible: true,
    x: 910,
    y: 268,
  },
};

export const logsCopiedState: LogsSurfaceState = {
  ...logsSurfaceState,
  copied: true,
};

export const logsCombinedContentState: LogsSurfaceState = {
  ...logsSurfaceState,
  expandedContent: {
    'log-render-error': 'stack',
  },
  logs: logsSurfaceState.logs.map(log => (
    log.id === 'log-render-error'
      ? {
          ...log,
          meta: {
            attempt: 1,
            endpoint: 'assets.launch.clientlabs.dev',
            retryScheduled: true,
          },
        }
      : log
  )),
};

export const logsHasMoreState: LogsSurfaceState = {
  ...logsSurfaceState,
  expandedContent: {},
  logs: Array.from({length: 126}, (_, index) => {
    const source = index % 5 === 0 ? 'database' : index % 5 === 1 ? 'flows' : index % 5 === 2 ? 'actions' : index % 5 === 3 ? 'video' : 'app-events';
    const level = index % 11 === 0 ? 'error' : index % 7 === 0 ? 'warn' : index % 3 === 0 ? 'debug' : 'info';
    return {
      id: `log-history-${index}`,
      level,
      message: `Historical launch log event ${String(index + 1).padStart(3, '0')}`,
      source,
      timestamp: now - index * 1000,
    };
  }),
  searchTerm: '',
};

export const logsLaunchReleaseState: LogsSurfaceState = {
  ...logsSurfaceState,
  expandedContent: {
    'log-obsolete-apps': 'meta',
  },
  filterLevel: 'all',
  logs: [
    {
      id: 'log-obsolete-apps',
      level: 'info',
      message: 'all obsolete apps removed',
      meta: {
        command: '/replace-obsolete-apps',
        removed: ['anti-gravity', 'cursor', 'vscode', 'notion', 'obsidian', 'tick-tick'],
        threadId: 'thread-replace-obsolete-apps',
      },
      source: 'flows',
      timestamp: now,
    },
    {
      id: 'log-publish-pr',
      level: 'debug',
      message: 'Deleted 6 obsolete application records',
      meta: {
        action: 'Find and delete obsolete apps',
        durationMs: 1284,
      },
      source: 'actions',
      timestamp: now - 5_000,
    },
    {
      id: 'log-command-route',
      level: 'info',
      message: 'Matched user.command route: /replace-obsolete-apps',
      meta: {
        branch: '/replace-obsolete-apps',
        flowId: 'root-flow',
      },
      source: 'brain',
      timestamp: now - 11_000,
    },
  ],
  searchTerm: 'obsolete',
};

export function logsLaunchReleaseStateForFrame(frame: number): LogsSurfaceState {
  const local = Math.max(0, frame - 72);
  const searchTerm = textReveal('all obsolete apps removed', local, 4, 30);
  return {
    ...logsLaunchReleaseState,
    expandedContent: local > 38 ? logsLaunchReleaseState.expandedContent : {},
    searchTerm,
  };
}

export function logsSurfaceStateForFrame(frame: number): LogsSurfaceState {
  if (frame > 185) return logsContextMenuState;
  if (frame > 150) return logsFilteredState;
  if (frame > 90) return {...logsSurfaceState, copied: true};
  return logsSurfaceState;
}
