import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {GeneralSettingsNavId, SettingsSurfaceState} from './settingsTypes';
import './GeneralSettingsTab.module.css';

const styles = makeStyles('GeneralSettingsTab');

const navTop: Array<{id: GeneralSettingsNavId; label: string; icon: React.ComponentType<{size?: number}>}> = [
  {id: 'application', label: 'Application', icon: Icons.Settings},
  {id: 'secrets', label: 'Providers', icon: Icons.Key},
  {id: 'projects', label: 'Projects', icon: Icons.Briefcase},
  {id: 'personal', label: 'Personal', icon: Icons.User},
];

const navBottom: Array<{id: GeneralSettingsNavId; label: string; icon: React.ComponentType<{size?: number}>}> = [
  {id: 'json', label: 'JSON', icon: Icons.FileJson},
];

export function GeneralSettingsTab({state}: {state: SettingsSurfaceState}) {
  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.navTop}>{navTop.map(item => <NavItem key={item.id} item={item} active={state.generalNavItem === item.id} />)}</div>
        <div className={styles.navBottom}>{navBottom.map(item => <NavItem key={item.id} item={item} active={state.generalNavItem === item.id} />)}</div>
      </aside>
      <section className={styles.content}>
        {state.generalNavItem === 'application' ? <ApplicationSettings state={state} /> : <PlaceholderSettings id={state.generalNavItem} />}
      </section>
    </div>
  );
}

function NavItem({active, item}: {active: boolean; item: {label: string; icon: React.ComponentType<{size?: number}>}}) {
  const Icon = item.icon;
  return (
    <div className={`${styles.navItem} ${active ? styles.active : ''}`}>
      <Icon size={16} />
      {item.label}
    </div>
  );
}

function ApplicationSettings({state}: {state: SettingsSurfaceState}) {
  return (
    <div className={styles.max}>
      <header className={styles.header}>
        <h2 className={styles.title}>Application</h2>
        <p className={styles.description}>Import setup packs, configure hotkeys, and manage app data.</p>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}><Icons.Keyboard size={16} /> Hotkeys</div>
        {state.hotkeys.map(hotkey => (
          <div key={hotkey.action} className={styles.hotkey}>
            <span>{hotkey.action}</span>
            <span className={styles.shortcut}>{hotkey.shortcut}</span>
          </div>
        ))}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><Icons.PackageOpen size={16} /> Import Setup Pack</div>
        <p className={styles.description} style={{marginBottom: 16}}>
          Import compiled actions, prompts, flows, library docs, and notes from a setup pack directory.
        </p>
        <div className={styles.button}>{state.importStatus === 'previewing' ? 'Reading pack...' : 'Select Compiled Directory...'}</div>
      </section>

      <section className={`${styles.card} ${styles.reset}`}>
        <div className={`${styles.cardHeader} ${styles.resetTitle}`}><Icons.RotateCcw size={16} /> Reset App</div>
        <p className={styles.description} style={{marginBottom: 16}}>Erase all data and restore defaults. This cannot be undone.</p>
        <div className={styles.button} style={{background: 'rgb(220 38 38)'}}>Reset App...</div>
      </section>

      {state.saveStatus === 'saved' ? <div className={styles.save}><Icons.CircleCheck size={12} /> Settings saved</div> : null}
    </div>
  );
}

function PlaceholderSettings({id}: {id: GeneralSettingsNavId}) {
  const label = id === 'secrets' ? 'Secrets' : id === 'projects' ? 'Projects' : id === 'personal' ? 'Personal Information' : 'Settings JSON';
  return (
    <div className={styles.max}>
      <header className={styles.header}>
        <h2 className={styles.title}>{label}</h2>
        <p className={styles.description}>First-pass replica placeholder for the selected settings section.</p>
      </header>
      <section className={styles.card}>
        <div className={styles.cardHeader}>{label}</div>
      </section>
    </div>
  );
}
