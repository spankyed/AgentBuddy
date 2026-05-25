import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {LibraryPanel} from '../../agentbuddy-ui/library/LibraryPanel';
import {LibrarySurface} from '../../agentbuddy-ui/library/LibrarySurface';
import type {LibrarySurfaceState} from '../../agentbuddy-ui/library/libraryTypes';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {useAppWindowLayout} from '../../film/appWindowLayout';
import {librarySurfaceState} from '../../film/state/library';

function LibraryDemoWindow({state = librarySurfaceState}: {state?: LibrarySurfaceState}) {
  const layout = useAppWindowLayout({hasRightRail: true});
  return (
    <SurfaceFrame>
      <AppWindow
        activePlugin="library"
        breadcrumbs={['LIBRARY']}
        composer={false}
        layout={layout}
        rightRail={<LibraryPanel state={state.panel} />}
      >
        <LibrarySurface state={state} />
      </AppWindow>
    </SurfaceFrame>
  );
}

export const LibrarySurfaceDemo = () => <LibraryDemoWindow />;
