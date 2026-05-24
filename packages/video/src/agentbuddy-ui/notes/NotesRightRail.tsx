import './NotesRightRail.module.css';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTreeItem} from './NoteTreeItem';
import {NotesRailSection} from './NotesRailSection';
import type {NoteTreeNodeState} from './noteTypes';
const styles = makeStyles('NotesRightRail');

type NotesRightRailProps = {
  activeId?: string;
  favorites: NoteTreeNodeState[];
  items: NoteTreeNodeState[];
};

export function NotesRightRail({activeId = 'tasklist', favorites, items}: NotesRightRailProps) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>Notes</span>
        <div className={styles.actions}>
          <button type="button"><Icons.Plus size={16} /></button>
          <button type="button"><Icons.Search size={16} /></button>
          <button type="button"><Icons.EllipsisVertical size={16} /></button>
        </div>
      </div>
      <div className={styles.scroller}>
        <NotesRailSection label="Favorites">
          {favorites.map(item => <NoteTreeItem key={item.id} activeId="" node={item} />)}
        </NotesRailSection>
        <section className={styles.tree}>
          {items.map(item => <NoteTreeItem key={item.id} activeId={activeId} node={item} />)}
        </section>
      </div>
    </div>
  );
}
