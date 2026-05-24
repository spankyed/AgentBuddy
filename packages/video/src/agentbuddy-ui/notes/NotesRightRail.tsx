import './NotesRightRail.module.css';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTreeItem} from './NoteTreeItem';
import {NotesRailSection} from './NotesRailSection';
import type {NoteTreeNodeState} from './noteTypes';
const styles = makeStyles('NotesRightRail');

export function NotesRightRail() {
  const favorites: NoteTreeNodeState[] = [
    {id: 'fav-current', icon: '🔥', title: 'current', noteType: 'document'},
    {id: 'fav-cli', icon: '💻', title: 'cli', noteType: 'document'},
    {id: 'fav-videos', icon: '🎬', title: 'Videos', noteType: 'document'},
  ];
  const groups: NoteTreeNodeState[] = [
    {id: 'clientlabs', icon: '🌐', title: 'Clientlabs', noteType: 'document'},
    {id: 'agentbuddy', icon: '🚀', title: 'Agentbuddy', noteType: 'document'},
    {id: 'tasklist', icon: '📝', title: 'Tasklist', noteType: 'tasklist'},
    {id: 'brand', icon: '⭐', title: 'Brand & Content', noteType: 'document'},
  ];
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
          {groups.map(item => <NoteTreeItem key={item.id} activeId="tasklist" node={item} />)}
        </section>
      </div>
    </div>
  );
}
