import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {SettingsSurface} from '../../agentbuddy-ui/settings/SettingsSurface';
import {useAppWindowLayout} from '../appWindowLayout';
import {settingsSurfaceState} from '../state/settings';

export function SettingsShot({variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="settings" breadcrumbs={['Settings']} composer={false} layout={layout}>
      <SettingsSurface state={settingsSurfaceState} />
    </AppWindow>
  );
}
