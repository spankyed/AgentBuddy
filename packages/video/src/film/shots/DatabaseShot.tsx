import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {DatabaseSurface} from '../../agentbuddy-ui/database/DatabaseSurface';
import {useAppWindowLayout} from '../appWindowLayout';
import {databaseSurfaceState} from '../state/database';

export function DatabaseShot({variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="database" breadcrumbs={['Database']} composer={false} layout={layout}>
      <DatabaseSurface state={databaseSurfaceState} />
    </AppWindow>
  );
}
