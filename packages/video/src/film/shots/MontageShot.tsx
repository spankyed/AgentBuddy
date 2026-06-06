import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {BrowserSurface} from '../../agentbuddy-ui/browser';
import {DatabaseSurface} from '../../agentbuddy-ui/database/DatabaseSurface';
import {LogsSurface} from '../../agentbuddy-ui/logs/LogsSurface';
import {ThreadConversation} from '../../agentbuddy-ui/threads/ThreadConversation';
import {montageShotViewForFrame} from '../state/montage';
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
        <MontageSurface view={view} />
      </AppWindow>
    </div>
  );
}

function MontageSurface({view}: {view: ReturnType<typeof montageShotViewForFrame>}) {
  if (view.surface === 'conversation') {
    return (
      <ThreadConversation
        assistant={{markdown: view.conversation.assistantMarkdown}}
        createdAt={view.conversation.createdAt}
        messageStyles={view.conversation.messageStyles}
        topInset={view.conversation.topInset}
        userMessage={view.conversation.userMessage}
      />
    );
  }

  if (view.surface === 'logs') {
    return <LogsSurface state={view.logs} />;
  }

  if (view.surface === 'browser') {
    return <BrowserSurface state={view.browser} />;
  }

  return <DatabaseSurface state={view.database} />;
}
