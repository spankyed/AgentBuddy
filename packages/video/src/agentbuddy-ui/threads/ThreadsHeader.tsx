import {Icons} from '../primitives/Icon';
import './ThreadsHeader.module.css';
import {makeStyles} from '../primitives/makeStyles';
import type {ThreadsHeaderState} from './threadTypes';

const styles = makeStyles('ThreadsHeader');

export function ThreadsHeader({state}: {state: ThreadsHeaderState}) {
  const activeView = state.activeView ?? 'kanban';
  return (
    <div className={styles.root}>
      <div className={styles.left}>
        <Icons.History size={16} />
        <span>{state.subtitle}</span>
      </div>
      <div className={styles.actions}>
        <div className={styles.toggleGroup}>
          <button className={activeView === 'list' ? styles.activeIconButton : styles.iconButton} title="List View"><Icons.List size={16} /></button>
          <button className={activeView === 'kanban' ? styles.activeIconButton : styles.iconButton} title="Kanban Board"><Icons.Columns size={16} /></button>
          <button className={activeView === 'dashboard' ? styles.activeIconButton : styles.iconButton} title="Dashboard"><Icons.PanelLeft size={16} /></button>
        </div>
        <button className={styles.filterButton}>
          <Icons.Filter size={14} />
          <span>{state.filterLabel}</span>
          {state.activeFilterCount ? <span className={styles.filterCount}>({state.activeFilterCount})</span> : null}
        </button>
        <div className={styles.search}>
          <Icons.Search className={styles.searchIcon} size={16} />
          <input className={styles.searchInput} value="" placeholder={state.searchPlaceholder} readOnly />
        </div>
        <button className={styles.newButton} data-onboarding-id="thread-create-button">{state.newThreadLabel}</button>
      </div>
    </div>
  );
}
