import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTreeItem} from './NoteTreeItem';
import type {NoteTreeNodeState} from './noteTypes';
import './TaskListPanel.module.css';

const styles = makeStyles('TaskListPanel');

const tasks: NoteTreeNodeState[] = [
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

// Mirrors packages/renderer/src/plugins/notes/components/TaskListPanel.vue.
export function TaskListPanel({activeId = 'current'}: {activeId?: string}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.emoji}>📝</span>
          <span>Tasklist</span>
        </div>
        <div className={styles.actions}>
          <button type="button" title="More actions"><Icons.MoreHorizontal size={16} /></button>
          <button type="button" title="Add task"><Icons.Plus size={16} /></button>
        </div>
      </header>
      <div className={styles.list}>
        {tasks.map(task => <NoteTreeItem key={task.id} activeId={activeId} node={task} taskMode />)}
      </div>
    </aside>
  );
}
