import {SurfaceFrame} from '../../film/SurfaceFrame';
import {ActionsShot} from '../../film/shots/ActionsShot';

export const ActionsSurfaceDemo = () => (
  <SurfaceFrame>
    <ActionsShot frame={90} />
  </SurfaceFrame>
);

export const ActionDetailDemo = () => (
  <SurfaceFrame>
    <ActionsShot frame={180} />
  </SurfaceFrame>
);
