import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import type {SettingsSurfaceState} from './settingsTypes';
import './SettingsSidebar.module.css';

const styles = makeStyles('SettingsSidebar');

export function SettingsSidebar({state}: {state: SettingsSurfaceState}) {
  return (
    <aside className={styles.root}>
      {state.sections.map(section => (
        <div key={section.id} className={cx(styles.item, section.id === state.activeSection && styles.active)}>
          {section.label}
        </div>
      ))}
    </aside>
  );
}
