import {Icons} from '../primitives/Icon';
import {ToolbarButton} from './ToolbarButton';
import './Toolbar.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('Toolbar');

export type PluginId = 'threads' | 'notes' | 'code' | 'flows' | 'actions' | 'prompts' | 'brain' | 'settings';

type ToolbarProps = {
  activePlugin: PluginId;
};

const topPlugins = [
  {id: 'threads', label: 'Threads', icon: Icons.Threads},
  {id: 'notes', label: 'Notes', icon: Icons.NotebookText},
  {id: 'code', label: 'Code', icon: Icons.Code},
  {id: 'flows', label: 'Flows', icon: Icons.Flows},
  {id: 'actions', label: 'Actions', icon: Icons.Play},
  {id: 'prompts', label: 'Prompts', icon: Icons.Sparkle},
  {id: 'brain', label: 'Brain', icon: Icons.Brain},
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
        <ToolbarButton id="settings" label="Settings" icon={Icons.Settings} active={activePlugin === 'settings'} />
      </div>
    </aside>
  );
}
