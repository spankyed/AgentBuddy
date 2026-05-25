import {Icons} from '../primitives/Icon';
import {ToolbarButton} from './ToolbarButton';
import './Toolbar.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('Toolbar');

export type PluginId =
  | 'threads'
  | 'notes'
  | 'code'
  | 'library'
  | 'flows'
  | 'actions'
  | 'prompts'
  | 'brain'
  | 'database'
  | 'logs'
  | 'settings';

type ToolbarProps = {
  activePlugin: PluginId;
};

const topPlugins = [
  {id: 'threads', label: 'Threads', icon: Icons.Threads},
  {id: 'notes', label: 'Notes', icon: Icons.NotebookText},
  {id: 'code', label: 'Code', icon: Icons.Code},
  {id: 'library', label: 'Library', icon: Icons.Library},
  {id: 'flows', label: 'Flows', icon: Icons.Flows},
  {id: 'actions', label: 'Actions', icon: Icons.Play},
  {id: 'prompts', label: 'Prompts', icon: Icons.Sparkle},
] as const;

const pinnedPlugins = [
  {id: 'brain', label: 'Brain', icon: Icons.Brain},
  {id: 'database', label: 'Database', icon: Icons.Database},
  {id: 'logs', label: 'Logs', icon: Icons.Bug},
  {id: 'settings', label: 'Settings', icon: Icons.Settings},
] as const;

// Mirrors packages/renderer/src/core/components/layout/toolbar.vue.
export function Toolbar({activePlugin}: ToolbarProps) {
  return (
    <aside className={styles.root} data-onboarding-id="toolbar">
      <div className={styles.windowControlsArea} />
      <div className={styles.scrollArea}>
        <div className={styles.buttonStack}>
          {topPlugins.map(item => (
            <ToolbarButton key={item.id} id={item.id} label={item.label} icon={item.icon} active={activePlugin === item.id} />
          ))}
        </div>
      </div>
      <div className={styles.pinnedArea}>
        {pinnedPlugins.map(item => (
          <ToolbarButton key={item.id} id={item.id} label={item.label} icon={item.icon} active={activePlugin === item.id} />
        ))}
      </div>
    </aside>
  );
}
