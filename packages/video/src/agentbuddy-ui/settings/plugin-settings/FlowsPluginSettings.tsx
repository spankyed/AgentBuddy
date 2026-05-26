import {Icons} from '../../primitives/Icon';
import {CollapsiblePluginSection} from './CollapsiblePluginSection';
import type {SettingsSurfaceState} from '../settingsTypes';
import './FlowsPluginSettings.module.css';
import {makeStyles} from '../../primitives/makeStyles';

const styles = makeStyles('FlowsPluginSettings');

type FlowsSettings = NonNullable<NonNullable<SettingsSurfaceState['selectedPluginSettings']>['flows']>;

const defaultFlowsSettings: FlowsSettings = {
  enableFlowPreview: true,
  flows: [],
};

export function FlowsPluginSettings({settings}: {settings?: FlowsSettings}) {
  const value = settings ?? defaultFlowsSettings;
  const exportDirectory = '';
  const currentRootFlow = value.rootFlowId
    ? value.flows.find(flow => flow.id === value.rootFlowId)
    : null;

  return (
    <div className={styles.root}>
      <CollapsiblePluginSection label="Root Flow">
        <p className={styles.copy}>Select which flow should be the root flow for dialog execution</p>
        <div className={styles.stack}>
          <div className={styles.row}>
            <span className={styles.label}>Root Flow:</span>
            <select className={styles.select} data-onboarding-id="settings-root-flow" defaultValue={value.rootFlowId ?? ''}>
              <option value="">None</option>
              {value.flows.map(flow => (
                <option key={flow.id} value={flow.id}>{flow.label || flow.id}</option>
              ))}
            </select>
          </div>
          {value.needsRestart && currentRootFlow ? (
            <div className={styles.restartNotice}>
              <Icons.AlertTriangle className={styles.restartIcon} size={20} />
              <div className={styles.restartBody}>
                <div className={styles.restartTitle}>Root flow changed - Brain restart required</div>
                <p className={styles.restartCopy}>The root flow has been updated. Please restart the application from Brain settings to apply the changes.</p>
                <button className={styles.restartButton} type="button">
                  <Icons.Brain size={16} />
                  Go to Brain Settings
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </CollapsiblePluginSection>

      <CollapsiblePluginSection label="Flow Preview">
        <p className={styles.copy}>Configure how flows are opened when clicking from the list</p>
        <div className={styles.stack}>
          <label className={styles.checkboxRow}>
            <input className={styles.checkbox} readOnly checked={value.enableFlowPreview} type="checkbox" />
            <span>
              <span className={styles.checkboxTitle}>Enable flow preview on single click</span>
              <span className={styles.checkboxCopy}>
                When enabled, single-click previews a flow with overlay. Double-click or click overlay to edit. When disabled, single-click opens the editor directly.
              </span>
            </span>
          </label>
        </div>
      </CollapsiblePluginSection>

      <CollapsiblePluginSection label="Import Flows">
        <p className={styles.copy}>Import flows from an exported DSL JSON file</p>
        <button className={styles.secondaryButton} type="button">
          <Icons.Upload size={16} />
          Select DSL File...
        </button>
      </CollapsiblePluginSection>

      <CollapsiblePluginSection label="Export Flows" defaultOpen={false}>
        <p className={styles.copy}>Export all flows to a DSL JSON file</p>
        <div className={styles.stack}>
          <div className={styles.directoryRow}>
            <input className={styles.directoryInput} readOnly type="text" value={exportDirectory} placeholder="Select output directory..." />
            <button className={styles.secondaryButton} type="button">
              <Icons.FolderOpen size={16} />
              Browse
            </button>
          </div>
          <button className={styles.secondaryButton} disabled={!exportDirectory} type="button">
            <Icons.Download size={16} />
            Export
          </button>
        </div>
      </CollapsiblePluginSection>
    </div>
  );
}
