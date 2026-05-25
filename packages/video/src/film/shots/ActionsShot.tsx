import {ActionsSurface} from '../../agentbuddy-ui/actions/ActionsSurface';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {useAppWindowLayout} from '../appWindowLayout';
import {actionDetailState, actionsSurfaceState} from '../state/actions';

export function ActionsShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  const state = frame > 120 ? actionDetailState : actionsSurfaceState;
  return (
    <AppWindow activePlugin="actions" breadcrumbs={['Actions']} composer={false} layout={layout}>
      <ActionsSurface state={state} />
    </AppWindow>
  );
}
