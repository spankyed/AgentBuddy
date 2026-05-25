import {SurfaceFrame} from '../../film/SurfaceFrame';
import {PromptsShot} from '../../film/shots/PromptsShot';

export const PromptsSurfaceDemo = () => (
  <SurfaceFrame>
    <PromptsShot frame={90} />
  </SurfaceFrame>
);

export const PromptDetailDemo = () => (
  <SurfaceFrame>
    <PromptsShot frame={180} />
  </SurfaceFrame>
);
