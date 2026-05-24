import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadsBoardSurface} from '../../agentbuddy-ui/threads/ThreadsBoardSurface';
import {boardShotState, boardViewForFrame} from '../state/board';
import {useAppWindowLayout} from '../appWindowLayout';

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = boardViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="threads" breadcrumbs={boardShotState.breadcrumbs} composer={false} layout={layout}>
      <ThreadsBoardSurface
        board={boardShotState.board}
        header={boardShotState.header}
        movingCard={{card: boardShotState.movingCard.card, style: view.movingCardStyle}}
      />
    </AppWindow>
  );
}
