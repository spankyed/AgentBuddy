import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import type {LibrarySurfaceState} from './libraryTypes';
import './LibrarySidebar.module.css';

const styles = makeStyles('LibrarySidebar');

export function LibrarySidebar({state}: {state: LibrarySurfaceState}) {
  return (
    <aside className={styles.root}>
      <div className={styles.header}>Library</div>
      {state.collections.map(collection => (
        <div key={collection.id} className={cx(styles.item, collection.id === state.activeCollectionId && styles.active)}>
          <span>{collection.label}</span>
          <span className={styles.count}>{collection.count}</span>
        </div>
      ))}
    </aside>
  );
}
