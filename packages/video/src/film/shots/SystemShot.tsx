import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {BrainSurface} from '../../agentbuddy-ui/brain/BrainSurface';
import {DatabaseSurface} from '../../agentbuddy-ui/database/DatabaseSurface';
import {LogsSurface} from '../../agentbuddy-ui/logs/LogsSurface';
import {SettingsSurface} from '../../agentbuddy-ui/settings/SettingsSurface';
import {ThreadChatCanvas} from '../../agentbuddy-ui/threads/ThreadChatCanvas';
import type {PluginId} from '../../agentbuddy-ui/chrome/Toolbar';
import {launchComposerState} from '../state/chat';
import {brainLaunchCommandState} from '../state/brain';
import {databaseMessagesBeforeDateState, databaseMessageLookupState} from '../state/database';
import {logsLaunchReleaseState} from '../state/logs';
import {settingsProvidersState} from '../state/settings';
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
      surface: <LogsSurface state={logsLaunchReleaseState} />,
    };
  }

  if (frame < 222) {
    return {
      activePlugin: 'database' as PluginId,
      breadcrumbs: ['Database'],
      composer: false as const,
      surface: <DatabaseSurface state={frame < 182 ? databaseMessageLookupState : databaseMessagesBeforeDateState} />,
    };
  }

  if (frame < 292) {
    return {
      activePlugin: 'brain' as PluginId,
      breadcrumbs: ['Brain'],
      composer: false as const,
      surface: <BrainSurface state={brainLaunchCommandState} />,
    };
  }

  return {
    activePlugin: 'settings' as PluginId,
    breadcrumbs: ['Settings'],
    composer: false as const,
    surface: <SettingsSurface state={settingsProvidersState} />,
  };
}
