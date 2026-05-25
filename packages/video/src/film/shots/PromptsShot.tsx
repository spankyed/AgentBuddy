import {PromptsSurface} from '../../agentbuddy-ui/prompts/PromptsSurface';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {useAppWindowLayout} from '../appWindowLayout';
import {promptDetailState, promptsSurfaceState} from '../state/prompts';

export function PromptsShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  const state = frame > 120 ? promptDetailState : promptsSurfaceState;
  return (
    <AppWindow activePlugin="prompts" breadcrumbs={['Prompts']} composer={false} layout={layout}>
      <PromptsSurface state={state} />
    </AppWindow>
  );
}
