import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {DatabaseSurface} from '../../agentbuddy-ui/database/DatabaseSurface';
import {useAppWindowLayout} from '../appWindowLayout';
import {databaseSurfaceStateForFrame} from '../state/database';

export function DatabaseShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="database" breadcrumbs={['Database']} composer={false} layout={layout}>
      <DatabaseSurface state={databaseSurfaceStateForFrame(frame)} />
    </AppWindow>
  );
}
