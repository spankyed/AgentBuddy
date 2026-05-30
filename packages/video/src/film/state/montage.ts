import type {PluginId} from '../../agentbuddy-ui/chrome/Toolbar';
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import type {DatabaseSurfaceState} from '../../agentbuddy-ui/database/databaseTypes';
import type {LogsSurfaceState} from '../../agentbuddy-ui/logs/logTypes';
import {launchComposerState} from './chat';
import {databaseMessagesBeforeDateState, databaseMessageLookupState} from './database';
import {logsLaunchReleaseStateForFrame} from './logs';
import {launchFilmStory} from './launchStory';
import {ease, mix, textReveal} from './timeline';

export type MontageShotView =
  | {
      activePlugin: PluginId;
      breadcrumbs: string[];
      composer: ChatComposerState;
      conversation: {
        assistantMarkdown: string;
        createdAt: string;
        messageStyles: {
          assistant: {
            opacity: number;
            transform: string;
          };
          user: {
            opacity: number;
            transform: string;
          };
        };
        topInset: number;
        userMessage: string;
      };
      surface: 'conversation';
    }
  | {
      activePlugin: PluginId;
      breadcrumbs: string[];
      composer: false;
      logs: LogsSurfaceState;
      surface: 'logs';
    }
  | {
      activePlugin: PluginId;
      breadcrumbs: string[];
      composer: false;
      database: DatabaseSurfaceState;
      surface: 'database';
    };

export function montageShotViewForFrame(frame: number): MontageShotView {
  if (frame < 72) {
    const command = launchFilmStory.command;
    const composerState = {
      ...launchComposerState,
      bottomTabs: {
        ...launchComposerState.bottomTabs!,
        active: 'active' as const,
        activeLabel: launchFilmStory.threads.deployChecklist.title,
      },
      sendPressed: frame > 20 && frame < 28,
      text: frame < 24 ? textReveal(command, frame, 4, 20) : '',
    };
    return {
      activePlugin: 'threads',
      breadcrumbs: ['Threads', launchFilmStory.threads.deployChecklist.title],
      composer: composerState,
      conversation: {
        assistantMarkdown: frame > 24
          ? textReveal('Matched the deploy-checkout command, ran migrations, and notified the #releases channel.', frame, 24, 58)
          : '',
        createdAt: 'just now',
        messageStyles: {
          assistant: {opacity: ease(frame, 28, 44), transform: `translateY(${mix(18, 0, ease(frame, 28, 44))}px)`},
          user: {opacity: ease(frame, 18, 28), transform: `translateY(${mix(14, 0, ease(frame, 18, 28))}px)`},
        },
        topInset: 96,
        userMessage: command,
      },
      surface: 'conversation',
    };
  }

  if (frame < 142) {
    return {
      activePlugin: 'logs',
      breadcrumbs: ['Logs'],
      composer: false,
      logs: logsLaunchReleaseStateForFrame(frame),
      surface: 'logs',
    };
  }

  if (frame < 252) {
    return {
      activePlugin: 'database',
      breadcrumbs: ['Database'],
      composer: false,
      database: databaseStateForMontageFrame(frame),
      surface: 'database',
    };
  }

  return {
    activePlugin: 'logs',
    breadcrumbs: ['Logs'],
    composer: false,
    logs: logsLaunchReleaseStateForFrame(frame + 48),
    surface: 'logs',
  };
}

function databaseStateForMontageFrame(frame: number): DatabaseSurfaceState {
  const state = frame < 196 ? databaseMessageLookupState : databaseMessagesBeforeDateState;
  const segmentStart = frame < 196 ? 142 : 196;
  const local = frame - segmentStart;
  const query = textReveal(state.currentQuery, local, 0, 4);

  if (local < 4) {
    return {
      ...state,
      currentQuery: query,
      executePressed: false,
      executionTime: null,
      isLoading: false,
      queryResult: null,
      successMessage: '',
    };
  }

  if (local < 8) {
    return {
      ...state,
      currentQuery: state.currentQuery,
      executePressed: local < 6,
      executionTime: null,
      isLoading: true,
      queryResult: null,
      successMessage: '',
    };
  }

  return {
    ...state,
    copiedResultRowIndex: local > 24 ? 0 : state.copiedResultRowIndex,
    executePressed: false,
  };
}
