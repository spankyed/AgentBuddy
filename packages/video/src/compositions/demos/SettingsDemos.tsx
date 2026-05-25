import {SurfaceFrame} from '../../film/SurfaceFrame';
import {SettingsShot} from '../../film/shots/SettingsShot';

export const SettingsSurfaceDemo = () => (
  <SurfaceFrame>
    <SettingsShot frame={60} />
  </SurfaceFrame>
);

export const SettingsApplicationDemo = () => (
  <SurfaceFrame>
    <SettingsShot frame={24} />
  </SurfaceFrame>
);

export const SettingsProjectsDemo = () => (
  <SurfaceFrame>
    <SettingsShot frame={96} />
  </SurfaceFrame>
);

export const SettingsPersonalDemo = () => (
  <SurfaceFrame>
    <SettingsShot frame={132} />
  </SurfaceFrame>
);

export const SettingsPluginsDemo = () => (
  <SurfaceFrame>
    <SettingsShot frame={168} />
  </SurfaceFrame>
);
