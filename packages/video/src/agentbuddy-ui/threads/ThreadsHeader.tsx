import {Icons} from '../primitives/Icon';
import './ThreadsHeader.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ThreadsHeader');

export function ThreadsHeader({activeView = 'kanban'}: {activeView?: 'list' | 'kanban' | 'dashboard'}) {
  return (
    <div className={styles.root}>
      <div className={styles.left}>
        <Icons.History size={16} />
        <span>Manage agent threads</span>
      </div>
      <div className={styles.actions}>
        <div className={styles.toggleGroup}>
          <button className={activeView === 'list' ? styles.activeIconButton : styles.iconButton} title="List View"><Icons.List size={16} /></button>
          <button className={activeView === 'kanban' ? styles.activeIconButton : styles.iconButton} title="Kanban Board"><Icons.Columns size={16} /></button>
          <button className={activeView === 'dashboard' ? styles.activeIconButton : styles.iconButton} title="Dashboard"><Icons.PanelLeft size={16} /></button>
        </div>
        <button className={styles.filterButton}><Icons.Filter size={14} /><span>Filter</span></button>
        <div className={styles.search}>
          <Icons.Search className={styles.searchIcon} size={16} />
          <input className={styles.searchInput} value="" placeholder="Search threads..." readOnly />
        </div>
        <button className={styles.newButton} data-onboarding-id="thread-create-button">New Thread</button>
      </div>
    </div>
  );
}
