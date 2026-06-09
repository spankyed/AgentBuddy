/**
 * Directory State Management:
 *
 * State:
 * - baseDirectory: Root workspace directory (project root)
 * - activeDirectory: Currently browsed subdirectory in explorer
 * - Both are duplicated across parent and children for independence
 * - Parent broadcasts directory changes to all children
 *
 * Persistence (saved to settings):
 * - baseDirectory: Current base directory (tracked automatically on navigation)
 * - defaultBaseDirectory: User's explicit preferred default (set via settings UI)
 *
 * Priority on startup:
 *   baseDirectory > defaultBaseDirectory > first workspace project > null
 */
import { setup, enqueueActions, assign } from 'xstate'
import { emit } from '@/core/shared/actor-helpers'
import { rootEvents } from '@/core/router/bus-emitter'
import './repository' // side-effect: registers terminalQueries/terminalCommands
import { defineSystem } from '@/core/framework/define-system'
import { GitRepository } from './services/git'
import { GitWatcherService } from './services/gitwatcher'
import { repository } from '@/repository'

// child systems
import { explorerSystem, type IncomingExplorerEvents, type OutgoingExplorerEvents } from './features/explorer'
import { searchSystem, type IncomingSearchEvents, type OutgoingSearchEvents } from './features/search'
import { commitSystem, type IncomingCommitEvents, type OutgoingCommitEvents } from './features/commit'
import { pullRequestSystem, type IncomingPullRequestEvents, type OutgoingPullRequestEvents } from './features/pull-request'
import { terminalSystem, type IncomingTerminalEvents, type OutgoingTerminalEvents } from './features/terminal'
import { actionsSystem, type IncomingActionsEvents, type OutgoingActionsEvents } from './features/actions'
import { promptsSystem, type IncomingPromptsEvents, type OutgoingPromptsEvents } from './features/prompts'

// Union all incoming events from child systems
type IncomingCodeEvents =
  | IncomingExplorerEvents
  | IncomingSearchEvents
  | IncomingCommitEvents
  | IncomingPullRequestEvents
  | IncomingTerminalEvents
  | IncomingActionsEvents
  | IncomingPromptsEvents
  | { type: 'SET_BASE_DIRECTORY'; path: string; fromUserNavigation?: boolean }

// Union all outgoing events from child systems  
export type OutgoingCodeEvents =
  | OutgoingExplorerEvents
  | OutgoingSearchEvents
  | OutgoingCommitEvents
  | OutgoingPullRequestEvents
  | OutgoingTerminalEvents
  | OutgoingActionsEvents
  // Broadcast events (sent to all child systems)
  | { type: 'CODE_CONNECTED'; data: CodeConnectedData }
  | { type: 'CODE_SETTINGS_UPDATED'; settings: CodeSettings }

// Import only the type needed for broadcast event
import { TerminalInfo, CodeConnectedData, CodeSettings } from './types'

type CodeInternalEvents = { type: 'CODE_SETTINGS_UPDATED'; settings: CodeSettings }

export const codeDef = defineSystem('code')<IncomingCodeEvents | CodeInternalEvents, OutgoingCodeEvents, Context>();
const id = codeDef.id;

export interface Context {
  baseDirectory: string | null
  gitRepository: GitRepository | null
  gitWatcher: GitWatcherService | null
}

/**
 * Resolves the initial base directory on system startup.
 * Priority chain: baseDirectory > defaultBaseDirectory > first workspace project > null
 */
function resolveInitialDirectory(
  codeSettings: CodeSettings | undefined,
  projects: any[]
): string | null {
  // User's explicit default takes priority
  if (codeSettings?.defaultBaseDirectory) {
    return codeSettings.defaultBaseDirectory
  }

  // Fall back to last directory they were in
  if (codeSettings?.baseDirectory) {
    return codeSettings.baseDirectory
  }

  // Fall back to first project directory
  const firstProjectDir = projects[0]?.directories?.[0]
  if (firstProjectDir) {
    return firstProjectDir
  }

  // No directory available
  return null
}

export const systemMachine = setup({
  types: codeDef.types,
  actors: {
    explorerSystem,
    searchSystem,
    commitSystem,
    pullRequestSystem,
    terminalSystem,
    actionsSystem,
    promptsSystem
  },
  actions: {
    spawnFeatureActors: enqueueActions(({ enqueue, context }) => {
      // Spawn all child systems with input and shared services
      enqueue.spawnChild('explorerSystem', {
        systemId: 'explorer',
        input: {
          baseDirectory: context.baseDirectory,
          gitWatcher: context.gitWatcher
        }
      });
      enqueue.spawnChild('searchSystem', {
        systemId: 'search',
        input: {
          baseDirectory: context.baseDirectory
        }
      });
      enqueue.spawnChild('commitSystem', {
        systemId: 'commit',
        input: {
          baseDirectory: context.baseDirectory,
          gitRepository: context.gitRepository,
          gitWatcher: context.gitWatcher
        }
      });
      enqueue.spawnChild('pullRequestSystem', {
        systemId: 'pr',
        input: {
          baseDirectory: context.baseDirectory,
          gitRepository: context.gitRepository
        }
      });
      enqueue.spawnChild('terminalSystem', {
        systemId: 'terminal',
        input: {
          baseDirectory: context.baseDirectory
        }
      });
      enqueue.spawnChild('actionsSystem', { systemId: 'codeActions' });
      enqueue.spawnChild('promptsSystem', { systemId: 'codePrompts' });
    }),


    routeEvent: ({ event, system }) => {
      const eventType = event.type;
      
      // Route based on prefix - prefix matches system ID
      const [prefix] = eventType.split('.');
      if (prefix) {
        system.get(prefix)?.send(event);
      }
    },

    updateBaseDirectory: assign({
      baseDirectory: ({ event }) => {
        const ev = codeDef.typeOf('SET_BASE_DIRECTORY', event)
        // Save to navigation history only when triggered by user navigation
        // (not when applying settings like defaultBaseDirectory)
        if (ev.fromUserNavigation !== false) {
          repository.settingsCommands.updateSettings('plugin', 'code', ['baseDirectory'], ev.path)
        }
        return ev.path
      },
      gitRepository: ({ event, context }) => {
        const ev = codeDef.typeOf('SET_BASE_DIRECTORY', event)
        // Clear the old repository's cache before creating new one
        if (context.gitRepository) {
          context.gitRepository.clearCache()
        }
        const repo = new GitRepository(ev.path)
        const codeSettings = repository.settingsQueries.getPluginSettings('code') as CodeSettings
        repo.setFetchConfig(
          codeSettings?.autoFetchRemote ?? false,
          codeSettings?.autoFetchIntervalSeconds ?? 180
        )
        return repo
      },
      gitWatcher: ({ event, context }) => {
        const ev = codeDef.typeOf('SET_BASE_DIRECTORY', event)
        // Stop the old watcher before creating new one
        if (context.gitWatcher) {
          context.gitWatcher.stopWatching()
        }
        return new GitWatcherService(ev.path)
      }
    }),

    notifyChildSystemsOfBaseChange: ({ event, system, context }) => {
      const ev = codeDef.typeOf('SET_BASE_DIRECTORY', event)
      const newPath = ev.path

      // Update child systems
      system.get('explorer')?.send({
        type: 'explorer.UPDATE_BASE_DIRECTORY',
        path: newPath,
        gitWatcher: context.gitWatcher
      });
      system.get('search')?.send({ type: 'search.UPDATE_BASE_DIRECTORY', path: newPath });
      // Pass the new git services to systems that need them
      system.get('commit')?.send({
        type: 'commit.UPDATE_BASE_DIRECTORY',
        path: newPath,
        gitRepository: context.gitRepository,
        gitWatcher: context.gitWatcher
      });
      system.get('pr')?.send({
        type: 'pr.UPDATE_BASE_DIRECTORY',
        path: newPath,
        gitRepository: context.gitRepository
      });
      // Note: Updates terminal's base directory for new terminal creation.
      // Individual terminal processes track their own cwd independently.
      system.get('terminal')?.send({ type: 'terminal.UPDATE_BASE_DIRECTORY', path: newPath });
    },

    updateSettings: ({ event, context, self }) => {
      const ev = event as { type: 'CODE_SETTINGS_UPDATED'; settings: CodeSettings }

      // Check if defaultBaseDirectory changed and apply it immediately for instant feedback
      if (ev.settings.defaultBaseDirectory &&
          ev.settings.defaultBaseDirectory !== context.baseDirectory) {
        // Apply the new default base directory
        // Mark as non-navigation so it doesn't overwrite baseDirectory
        self.send({
          type: 'SET_BASE_DIRECTORY',
          path: ev.settings.defaultBaseDirectory,
          fromUserNavigation: false
        })
      }

      // Update git fetch config if repository exists
      if (context.gitRepository) {
        context.gitRepository.setFetchConfig(
          ev.settings.autoFetchRemote ?? false,
          ev.settings.autoFetchIntervalSeconds ?? 180
        )
      }

      // Forward settings to frontend
      const wrapped = emit(id, {
        type: 'CODE_SETTINGS_UPDATED',
        settings: ev.settings
      })
      rootEvents.emitOutgoing(wrapped.event)
    },
    
    broadcastConnected: ({ system, context }) => {
      // Send CODE_CONNECTED to all children that need it
      system.get('explorer')?.send({ type: 'CODE_CONNECTED' });
      system.get('terminal')?.send({ type: 'CODE_CONNECTED' });
      system.get('codeActions')?.send({ type: 'CODE_CONNECTED' });
      system.get('codePrompts')?.send({ type: 'CODE_CONNECTED' });

      // Get code settings - this will create default settings if they don't exist
      const codeSettings = repository.settingsQueries.getPluginSettings('code') as CodeSettings;

      // Send initial directory state to frontend
      const connectedData: CodeConnectedData = {
        baseDirectory: context.baseDirectory,
        settings: codeSettings
      };

      const wrapped = emit(id, {
        type: 'CODE_CONNECTED',
        data: connectedData
      })
      rootEvents.emitOutgoing(wrapped.event)
    },
    
    setupGitWatcher: async ({ context, system }) => {
      if (!context.gitWatcher || !context.gitRepository) {
        // No directory selected yet
        return
      }

      // Give the watcher a reference to the git repo for write-in-progress checks
      context.gitWatcher.setGitRepository(context.gitRepository)

      // Set up the callback for git changes
      context.gitWatcher.setChangeCallback(() => {
        // Clear git cache when git status changes
        context.gitRepository?.clearCache()

        // Notify commit system of changes (commit system forwards to PR system)
        system.get('commit')?.send({ type: 'commit.GIT_STATUS_CHANGED' })
      })

      // Start watching git changes
      await context.gitWatcher.startWatching()
    },

    restartGitWatcher: async ({ context, system }) => {
      if (!context.gitWatcher || !context.gitRepository) {
        return
      }

      // Give the watcher a reference to the git repo for write-in-progress checks
      context.gitWatcher.setGitRepository(context.gitRepository)

      // Set up the callback for git changes (same as setupGitWatcher)
      context.gitWatcher.setChangeCallback(() => {
        // Clear git cache when git status changes
        context.gitRepository?.clearCache()

        // Notify commit system of changes (commit system forwards to PR system)
        system.get('commit')?.send({ type: 'commit.GIT_STATUS_CHANGED' })
      })

      // Start watching git changes
      await context.gitWatcher.startWatching()
    }
  }
}).createMachine({
  id,
  initial: 'idle',
  context: () => {
    const codeSettings = repository.settingsQueries.getPluginSettings('code') as CodeSettings
    const projects = (repository.settingsQueries.getGeneralSettings('projects') as any) || []

    // Resolve initial directory using priority chain
    const baseDir = resolveInitialDirectory(codeSettings, projects)

    const gitRepo = baseDir ? new GitRepository(baseDir) : null
    if (gitRepo) {
      gitRepo.setFetchConfig(
        codeSettings?.autoFetchRemote ?? false,
        codeSettings?.autoFetchIntervalSeconds ?? 180
      )
    }

    return {
      baseDirectory: baseDir,
      gitRepository: gitRepo,
      gitWatcher: baseDir ? new GitWatcherService(baseDir) : null
    }
  },
  entry: ['spawnFeatureActors', 'setupGitWatcher'],
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'broadcastConnected',
        },
        // Handle settings updates
        CODE_SETTINGS_UPDATED: {
          actions: 'updateSettings'
        },
        // Handle SET_BASE_DIRECTORY specially
        SET_BASE_DIRECTORY: {
          actions: ['updateBaseDirectory', 'notifyChildSystemsOfBaseChange', 'restartGitWatcher']
        },
        // Worktree switch is intercepted here to change baseDirectory
        'commit.WORKTREE_SWITCH': {
          actions: ({ event, self }) => {
            const ev = event as { type: 'commit.WORKTREE_SWITCH'; path: string }
            self.send({ type: 'SET_BASE_DIRECTORY', path: ev.path, fromUserNavigation: true })
          }
        },
        // All other events get routed to children
        '*': {
          actions: 'routeEvent'
        }
      }
    }
  }
})