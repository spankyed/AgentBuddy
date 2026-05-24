import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTreeItem} from './NoteTreeItem';
import type {NoteTreeNodeState} from './noteTypes';
import './TaskListPanel.module.css';

const styles = makeStyles('TaskListPanel');

type TaskListPanelProps = {
  activeId?: string;
  items: NoteTreeNodeState[];
};

// Mirrors packages/renderer/src/plugins/notes/components/TaskListPanel.vue.
export function TaskListPanel({activeId = 'current', items}: TaskListPanelProps) {
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
        {items.map(task => <NoteTreeItem key={task.id} activeId={activeId} node={task} taskMode />)}
      </div>
    </aside>
  );
}
