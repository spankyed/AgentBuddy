import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {BrainSurface} from '../../agentbuddy-ui/brain/BrainSurface';
import {DatabaseSurface} from '../../agentbuddy-ui/database/DatabaseSurface';
import {LogsSurface} from '../../agentbuddy-ui/logs/LogsSurface';
import {SettingsSurface} from '../../agentbuddy-ui/settings/SettingsSurface';
import {ThreadChatCanvas} from '../../agentbuddy-ui/threads/ThreadChatCanvas';
import type {DatabaseSurfaceState} from '../../agentbuddy-ui/database/databaseTypes';
import type {PluginId} from '../../agentbuddy-ui/chrome/Toolbar';
import {launchComposerState} from '../state/chat';
import {brainLaunchCommandStateForFrame} from '../state/brain';
import {databaseMessagesBeforeDateState, databaseMessageLookupState} from '../state/database';
import {logsLaunchReleaseStateForFrame} from '../state/logs';
import {settingsProvidersStateForFrame} from '../state/settings';
import {textReveal} from '../state/timeline';
import {useAppWindowLayout} from '../appWindowLayout';

export function SystemShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = systemShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});

  return (
    <AppWindow activePlugin={view.activePlugin} breadcrumbs={view.breadcrumbs} composer={view.composer} layout={layout}>
      {view.surface}
    </AppWindow>
  );
}

function systemShotViewForFrame(frame: number) {
  if (frame < 72) {
    return {
      activePlugin: 'threads' as PluginId,
      breadcrumbs: ['Threads'],
      composer: {
        ...launchComposerState,
        sendPressed: frame > 54 && frame < 66,
        text: textReveal('/replace-obsolete-apps', frame, 12, 52),
      },
      surface: <ThreadChatCanvas />,
    };
  }

  if (frame < 142) {
    return {
      activePlugin: 'logs' as PluginId,
      breadcrumbs: ['Logs'],
      composer: false as const,
      surface: <LogsSurface state={logsLaunchReleaseStateForFrame(frame)} />,
    };
  }

  if (frame < 222) {
    return {
      activePlugin: 'database' as PluginId,
      breadcrumbs: ['Database'],
      composer: false as const,
      surface: <DatabaseSurface state={databaseStateForSystemFrame(frame)} />,
    };
  }

  if (frame < 292) {
    return {
      activePlugin: 'brain' as PluginId,
      breadcrumbs: ['Brain'],
      composer: false as const,
      surface: <BrainSurface state={brainLaunchCommandStateForFrame(frame)} />,
    };
  }

  return {
    activePlugin: 'settings' as PluginId,
    breadcrumbs: ['Settings'],
    composer: false as const,
    surface: <SettingsSurface state={settingsProvidersStateForFrame(frame)} />,
  };
}

function databaseStateForSystemFrame(frame: number): DatabaseSurfaceState {
  const state = frame < 182 ? databaseMessageLookupState : databaseMessagesBeforeDateState;
  const segmentStart = frame < 182 ? 142 : 182;
  const local = frame - segmentStart;
  const query = textReveal(state.currentQuery, local, 0, 24);

  if (local < 24) {
    return {
      ...state,
      currentQuery: query,
      executionTime: null,
      isLoading: false,
      queryResult: null,
      successMessage: '',
    };
  }

  if (local < 36) {
    return {
      ...state,
      currentQuery: state.currentQuery,
      executionTime: null,
      isLoading: true,
      queryResult: null,
      successMessage: '',
    };
  }

  return state;
}
