import {cx} from '../primitives/classNames';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {LibrarySurfaceState} from './libraryTypes';
import './LibraryItemList.module.css';

const styles = makeStyles('LibraryItemList');

export function LibraryItemList({state}: {state: LibrarySurfaceState}) {
  return (
    <section className={styles.root}>
      <header className={styles.toolbar}>
        <span>Items</span>
        <Icons.Search size={14} />
      </header>
      <div className={styles.list}>
        {state.items.map(item => (
          <div key={item.id} className={cx(styles.item, item.id === state.activeItemId && styles.active)}>
            <div className={styles.title}>{item.title}</div>
            <div className={styles.meta}>{item.kind} · {item.updatedAt}{item.status ? ` · ${item.status}` : ''}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
