import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {PromptsSurface} from '../../agentbuddy-ui/prompts/PromptsSurface';
import {useAppWindowLayout} from '../appWindowLayout';
import {promptsSurfaceState} from '../state/prompts';

export function PromptsShot({variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="prompts" breadcrumbs={['Prompts']} composer={false} layout={layout}>
      <PromptsSurface state={promptsSurfaceState} />
    </AppWindow>
  );
}
