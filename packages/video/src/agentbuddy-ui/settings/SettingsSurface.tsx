import {makeStyles} from '../primitives/makeStyles';
import {SettingsPanel} from './SettingsPanel';
import {SettingsSidebar} from './SettingsSidebar';
import type {SettingsSurfaceState} from './settingsTypes';
import './SettingsSurface.module.css';

const styles = makeStyles('SettingsSurface');

export function SettingsSurface({state}: {state: SettingsSurfaceState}) {
  return (
    <div className={styles.root}>
      <SettingsSidebar state={state} />
      <SettingsPanel state={state} />
    </div>
  );
}
