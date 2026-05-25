import {SurfaceFrame} from '../../film/SurfaceFrame';
import {DatabaseShot} from '../../film/shots/DatabaseShot';
import {LogsShot} from '../../film/shots/LogsShot';
import {SettingsShot} from '../../film/shots/SettingsShot';

export const DatabaseSurfaceDemo = () => (
  <SurfaceFrame>
    <DatabaseShot frame={90} />
  </SurfaceFrame>
);

export const LogsSurfaceDemo = () => (
  <SurfaceFrame>
    <LogsShot frame={90} />
  </SurfaceFrame>
);

export const SettingsSurfaceDemo = () => (
  <SurfaceFrame>
    <SettingsShot frame={90} />
  </SurfaceFrame>
);
