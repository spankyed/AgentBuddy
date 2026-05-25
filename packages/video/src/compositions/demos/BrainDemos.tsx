import {SurfaceFrame} from '../../film/SurfaceFrame';
import {BrainShot} from '../../film/shots/BrainShot';

export const BrainSurfaceDemo = () => (
  <SurfaceFrame>
    <BrainShot frame={90} />
  </SurfaceFrame>
);
