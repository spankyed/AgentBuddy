import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {LibrarySurface} from '../../agentbuddy-ui/library/LibrarySurface';
import {useAppWindowLayout} from '../appWindowLayout';
import {librarySurfaceState} from '../state/library';

export function LibraryShot({variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="library" breadcrumbs={['Library']} composer={false} layout={layout}>
      <LibrarySurface state={librarySurfaceState} />
    </AppWindow>
  );
}
