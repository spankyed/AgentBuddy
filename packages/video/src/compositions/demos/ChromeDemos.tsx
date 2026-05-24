import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {useAppWindowLayout} from '../../film/appWindowLayout';

export const ToolbarDemo = () => {
  const layout = useAppWindowLayout({});
  return (
    <SurfaceFrame>
      <AppWindow activePlugin="code" breadcrumbs={['Code']} composer={false} layout={layout}>
        <div />
      </AppWindow>
    </SurfaceFrame>
  );
};
