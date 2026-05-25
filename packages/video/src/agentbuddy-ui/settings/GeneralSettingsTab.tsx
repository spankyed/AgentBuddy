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
        {state.generalNavItem === 'application' ? <ApplicationSettings state={state} /> : null}
        {state.generalNavItem === 'secrets' ? <SecretsSettings state={state} /> : null}
        {state.generalNavItem === 'projects' ? <ProjectsSettings state={state} /> : null}
        {state.generalNavItem === 'personal' ? <PersonalSettings state={state} /> : null}
        {state.generalNavItem === 'json' ? <JsonSettings state={state} /> : null}
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

function SecretsSettings({state}: {state: SettingsSurfaceState}) {
  return (
    <div className={styles.max}>
      <header className={styles.header}>
        <h2 className={styles.title}>Secrets</h2>
        <p className={styles.description}>Manage your API keys for various providers. Keys are stored securely in a separate database partition.</p>
      </header>

      <section className={styles.providerSection}>
        <h3 className={styles.sectionHeading}>CLI Providers</h3>
        <div className={styles.providerGrid}>
          {state.providers.cli.map(provider => (
            <div key={provider.label} className={styles.providerInfo}>
              <strong>{provider.label}</strong>
              <span>{provider.detected ? 'Detected on PATH' : 'Not detected'}</span>
            </div>
          ))}
          {state.providers.cli.map(provider => (
            <div key={`${provider.label}-input`} className={styles.providerInput}>{provider.command}</div>
          ))}
          {state.providers.cli.map(provider => (
            <div key={`${provider.label}-action`} className={styles.providerActions}>
              <Icons.Check size={14} />
            </div>
          ))}
        </div>
      </section>

      <div className={styles.divider} />

      <section className={styles.providerSection} data-onboarding-id="settings-secrets-section">
        <h3 className={styles.sectionHeading}>Standard Providers</h3>
        <div className={styles.providerGrid}>
          {state.providers.standard.map(provider => (
            <ProviderRow key={provider.key} provider={provider} />
          ))}
        </div>
      </section>

      <div className={styles.divider} />

      <section className={styles.providerSection}>
        <h3 className={styles.sectionHeading}>Custom Providers</h3>
        <div className={styles.providerGrid}>
          {state.providers.custom.map(provider => (
            <ProviderRow key={provider.name} provider={{key: provider.name, label: provider.name, description: 'Custom Provider', saved: provider.saved}} />
          ))}
        </div>
        <button className={styles.subtleButton}><Icons.Plus size={14} /> Add Custom Provider</button>
      </section>
    </div>
  );
}

function ProviderRow({provider}: {provider: {key: string; label: string; description: string; priority?: 'required' | 'recommended'; saved?: boolean}}) {
  return (
    <>
      <div className={styles.providerInfo}>
        <strong>{provider.label}<Icons.ExternalLink size={12} /></strong>
        <span>{provider.description}</span>
        {provider.priority ? <em className={provider.priority === 'required' ? styles.required : styles.recommended}>{provider.priority}</em> : null}
      </div>
      <div className={styles.providerInput}>{provider.saved ? '••••••••' : `Enter ${provider.label} API key`}</div>
      <div className={styles.providerActions}>
        {provider.saved ? <><Icons.Edit3 size={14} /><Icons.Trash2 size={14} /></> : <Icons.Eye size={14} />}
      </div>
    </>
  );
}

function ProjectsSettings({state}: {state: SettingsSurfaceState}) {
  return (
    <div className={styles.wide}>
      <p className={styles.description} style={{marginBottom: 24}}>Manage your projects. Each project can contain multiple directories.</p>
      <div className={styles.projects}>
        {state.projects.map(project => (
          <section key={project.name} className={styles.projectCard}>
            <header className={styles.projectHeader}>
              <span className={styles.colorDot} style={{background: project.color}} />
              <input value={project.name} readOnly />
              <button><Icons.Plus size={12} /> Add Directory</button>
              <button className={styles.iconOnly}><Icons.X size={14} /></button>
            </header>
            <div className={styles.directories}>
              {project.directories.map((directory, index) => (
                <span key={directory} className={styles.directoryPill} style={index === 0 ? {borderLeftColor: project.color} : undefined}>
                  <code>{directory.split('/').slice(-2).join('/')}</code>
                  <Icons.X size={12} />
                </span>
              ))}
            </div>
          </section>
        ))}
        <button className={styles.addProject}><Icons.Plus size={14} /> Add Project</button>
      </div>
    </div>
  );
}

function PersonalSettings({state}: {state: SettingsSurfaceState}) {
  const address = state.personal.address;
  return (
    <div className={styles.wide}>
      <header className={styles.header}>
        <h2 className={styles.title}>Personal Information</h2>
        <p className={styles.description}>Manage your personal details and contact information. This information is only stored locally on your device, to be used in AI workflows.</p>
      </header>
      <section className={styles.card}>
        <div className={styles.cardHeader}><Icons.User size={16} /> Personal Details</div>
        <div className={styles.formGrid}>
          <Field label="Full Name" helper="How you'd like to be addressed" value={state.personal.name} />
          <Field label="Phone Number" helper="For important notifications" value={state.personal.phoneNumber} />
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.cardHeader}><Icons.MapPin size={16} /> Address Information</div>
        <div className={styles.addressGrid}>
          <Field label="Street" value={address.street} />
          <Field label="Street 2" value={address.street2 || ''} />
          <Field label="City" value={address.city} />
          <Field label="State" value={address.state} />
          <Field label="Postal Code" value={address.postalCode} />
          <Field label="Country" value={address.country} />
        </div>
      </section>
    </div>
  );
}

function Field({label, value, helper}: {label: string; value: string; helper?: string}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input value={value} readOnly />
      {helper ? <small>{helper}</small> : null}
    </label>
  );
}

function JsonSettings({state}: {state: SettingsSurfaceState}) {
  return (
    <div className={styles.wide}>
      <header className={styles.header}>
        <h2 className={styles.title}>Settings JSON</h2>
        <p className={styles.description}>Directly inspect the local settings document.</p>
      </header>
      <pre className={styles.jsonEditor}>{state.settingsJson}</pre>
    </div>
  );
}
