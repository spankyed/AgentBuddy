import {BrainSurface} from '../../agentbuddy-ui/brain/BrainSurface';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {useAppWindowLayout} from '../appWindowLayout';
import {brainSurfaceState} from '../state/brain';

export function BrainShot({variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="brain" breadcrumbs={['Brain']} composer={false} layout={layout}>
      <BrainSurface state={brainSurfaceState} />
    </AppWindow>
  );
}
