import {SurfaceFrame} from '../../film/SurfaceFrame';
import {DatabaseShot} from '../../film/shots/DatabaseShot';

export const DatabaseSurfaceDemo = () => (
  <SurfaceFrame>
    <DatabaseShot frame={150} />
  </SurfaceFrame>
);
