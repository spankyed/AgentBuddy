import {ActionsSurface} from '../../agentbuddy-ui/actions/ActionsSurface';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {useAppWindowLayout} from '../appWindowLayout';
import {actionsSurfaceState} from '../state/actions';

export function ActionsShot({variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="actions" breadcrumbs={['Actions']} composer={false} layout={layout}>
      <ActionsSurface state={actionsSurfaceState} />
    </AppWindow>
  );
}
