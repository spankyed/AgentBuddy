import {SurfaceFrame} from '../../film/SurfaceFrame';
import {SettingsShot} from '../../film/shots/SettingsShot';

export const SettingsSurfaceDemo = () => (
  <SurfaceFrame>
    <SettingsShot frame={60} />
  </SurfaceFrame>
);
