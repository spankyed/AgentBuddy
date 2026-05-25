import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {LogsSurface} from '../../agentbuddy-ui/logs/LogsSurface';
import {useAppWindowLayout} from '../appWindowLayout';
import {logsSurfaceStateForFrame} from '../state/logs';

export function LogsShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="logs" breadcrumbs={['Logs']} composer={false} layout={layout}>
      <LogsSurface state={logsSurfaceStateForFrame(frame)} />
    </AppWindow>
  );
}
