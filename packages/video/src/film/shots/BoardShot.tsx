import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsBoardSurface} from '../../agentbuddy-ui/threads/ThreadsBoardSurface';
import {boardShotViewForFrame} from '../state/board';
import {useAppWindowLayout} from '../appWindowLayout';

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = boardShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="threads" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
      {view.createForm ? (
        <ThreadCreateForm state={view.createForm} />
      ) : (
        <ThreadsBoardSurface
          board={view.board}
          header={view.header}
          movingCard={view.movingCard}
        />
      )}
    </AppWindow>
  );
}
