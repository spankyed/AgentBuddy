import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {DatabaseSurface} from '../../agentbuddy-ui/database/DatabaseSurface';
import {LogsSurface} from '../../agentbuddy-ui/logs/LogsSurface';
import {ThreadConversation} from '../../agentbuddy-ui/threads/ThreadConversation';
import type {DatabaseSurfaceState} from '../../agentbuddy-ui/database/databaseTypes';
import type {PluginId} from '../../agentbuddy-ui/chrome/Toolbar';
import {launchComposerState} from '../state/chat';
import {databaseMessagesBeforeDateState, databaseMessageLookupState} from '../state/database';
import {logsLaunchReleaseStateForFrame} from '../state/logs';
import {launchFilmStory} from '../state/launchStory';
import {ease, mix, textReveal} from '../state/timeline';
import {useAppWindowLayout} from '../appWindowLayout';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './MontageShot.module.css';

const styles = makeStyles('MontageShot');

export function MontageShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = montageShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});

  return (
    <div className={styles.segment}>
      <AppWindow activePlugin={view.activePlugin} breadcrumbs={view.breadcrumbs} composer={view.composer} layout={layout}>
        {view.surface}
      </AppWindow>
    </div>
  );
}

function montageShotViewForFrame(frame: number) {
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
      activePlugin: 'threads' as PluginId,
      breadcrumbs: ['Threads', launchFilmStory.threads.deployChecklist.title],
      composer: composerState,
      surface: (
        <ThreadConversation
          assistant={{
            markdown: frame > 24
              ? textReveal('Matched the deploy-checkout command, ran migrations, and notified the #releases channel.', frame, 24, 58)
              : '',
          }}
          createdAt="just now"
          messageStyles={{
            assistant: {opacity: ease(frame, 28, 44), transform: `translateY(${mix(18, 0, ease(frame, 28, 44))}px)`},
            user: {opacity: ease(frame, 18, 28), transform: `translateY(${mix(14, 0, ease(frame, 18, 28))}px)`},
          }}
          topInset={96}
          userMessage={command}
        />
      ),
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

  if (frame < 252) {
    return {
      activePlugin: 'database' as PluginId,
      breadcrumbs: ['Database'],
      composer: false as const,
      surface: <DatabaseSurface state={databaseStateForMontageFrame(frame)} />,
    };
  }

  return {
    activePlugin: 'logs' as PluginId,
    breadcrumbs: ['Logs'],
    composer: false as const,
    surface: <LogsSurface state={logsLaunchReleaseStateForFrame(frame + 48)} />,
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
