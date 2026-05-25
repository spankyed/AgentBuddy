import {SurfaceFrame} from '../../film/SurfaceFrame';
import {LogsShot} from '../../film/shots/LogsShot';

export const LogsSurfaceDemo = () => (
  <SurfaceFrame>
    <LogsShot frame={150} />
  </SurfaceFrame>
);
