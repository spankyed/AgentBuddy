import {Icons} from '../primitives/Icon';
import './CodePanelToolbar.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('CodePanelToolbar');

export function CodePanelToolbar({branch, changeCount}: {branch: string; changeCount: number}) {
  const codePanels = [
    {id: 'explorer', label: 'Explorer', icon: Icons.FolderOpen},
    {id: 'commit', label: 'Commit Changes', icon: Icons.GitCommitVertical, badge: String(changeCount)},
    {id: 'pr', label: 'Pull Request', icon: Icons.PullRequest},
    {id: 'search', label: 'Search', icon: Icons.Search},
  ] as const;
  const internalPanels = [
    {id: 'actions', label: 'Actions', icon: Icons.Play},
    {id: 'prompts', label: 'Prompts', icon: Icons.Sparkle},
  ] as const;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}><Icons.GitCommitVertical size={16} /><span>Source Control</span></div>
        <button className={styles.refresh} title="Refresh"><Icons.RotateCcw size={16} /></button>
      </div>
      <div className={styles.panelRow}>
        <div className={styles.directory}>
          <Icons.FolderOpen size={12} />
          <span className={styles.directoryPath}>{branch}</span>
          <Icons.ChevronRight size={14} />
        </div>
        <div className={styles.panelButtons}>
          {codePanels.map(panel => {
            const Icon = panel.icon;
            return (
              <button key={panel.id} className={panel.id === 'commit' ? styles.activePanelButton : styles.panelButton} title={panel.label}>
                <Icon size={16} />
                {'badge' in panel ? <span className={styles.badge}>{panel.badge}</span> : null}
              </button>
            );
          })}
          <span className={styles.divider} />
          {internalPanels.map(panel => {
            const Icon = panel.icon;
            return <button key={panel.id} className={styles.panelButton} title={panel.label}><Icon size={16} /></button>;
          })}
        </div>
      </div>
    </div>
  );
}
