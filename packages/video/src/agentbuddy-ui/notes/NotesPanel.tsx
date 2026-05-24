import './NotesPanel.module.css';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTreeItem} from './NoteTreeItem';
import type {NoteTreeNodeState} from './noteTypes';
const styles = makeStyles('NotesPanel');

const notes: NoteTreeNodeState[] = [
  {id: 'default', title: 'default setup', icon: '🚧', noteType: 'task'},
  {id: 'current', title: 'current', icon: '🔥', noteType: 'task'},
  {id: 'remotion', title: 'remotion', noteType: 'task', children: []},
  {id: 'phone', title: 'phone app', noteType: 'task'},
  {id: 'bugs', title: 'bugs', icon: '🪲', noteType: 'task'},
  {id: 'manager', title: 'manager mode', noteType: 'task'},
  {id: 'bg', title: 'bg processes', noteType: 'task'},
  {id: 'chat', title: 'chat layout redesign', noteType: 'task', completed: true, muted: true},
  {id: 'roadmap', title: 'V1 Roadmap', icon: '🗺️', noteType: 'task'},
  {id: 'artifacts', title: 'artifacts & msg blocks', noteType: 'task'},
];

// Mirrors packages/renderer/src/plugins/notes/panel.vue.
export function NotesPanel({activeId = 'current'}: {activeId?: string}) {
  return (
    <aside className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTitle}><span>📝</span><span>Tasklist</span></div>
        <div className={styles.headerActions}>
          <button type="button"><Icons.MoreHorizontal size={16} /></button>
          <button type="button"><Icons.Plus size={16} /></button>
        </div>
      </div>
      <div className={styles.scroller}>
        <div className={styles.tree}>
          {notes.map(note => <NoteTreeItem key={note.id} activeId={activeId} node={note} taskMode />)}
        </div>
      </div>
      <div className={styles.scrollbar}><span /></div>
    </aside>
  );
}
