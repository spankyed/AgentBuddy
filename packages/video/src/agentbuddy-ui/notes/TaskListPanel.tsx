import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTreeItem} from './NoteTreeItem';
import type {NoteTreeNodeState} from './noteTypes';
import './TaskListPanel.module.css';

const styles = makeStyles('TaskListPanel');

type TaskListPanelProps = {
  activeId?: string | null;
  items: NoteTreeNodeState[];
  showCompleted?: boolean;
  title: {
    icon?: string;
    text: string;
  };
};

// Mirrors packages/renderer/src/plugins/notes/components/TaskListPanel.vue.
export function TaskListPanel({activeId = 'current', items, showCompleted = true, title}: TaskListPanelProps) {
  const incompleteTasks = items.filter(task => !task.completed);
  const completedTasks = items.filter(task => task.completed);
  const hasIncompleteTasks = incompleteTasks.length > 0;
  const hasVisibleCompletedTasks = showCompleted && completedTasks.length > 0;

  return (
    <aside className={styles.root}>
      <header className={activeId ? styles.header : styles.activeHeader}>
        <div className={styles.title}>
          {title.icon ? <span className={styles.emoji}>{title.icon}</span> : <Icons.ClipboardList size={16} />}
          <span>{title.text}</span>
        </div>
        <div className={styles.actions}>
          <button type="button" title="More actions"><Icons.MoreHorizontal size={16} /></button>
          <button type="button" title="Add task"><Icons.Plus size={16} /></button>
        </div>
      </header>
      <div className={styles.list}>
        {incompleteTasks.map(task => <NoteTreeItem key={task.id} activeId={activeId ?? ''} node={task} taskMode />)}
        {hasIncompleteTasks && hasVisibleCompletedTasks ? <div className={styles.completedDivider} /> : null}
        {hasVisibleCompletedTasks
          ? completedTasks.map(task => <NoteTreeItem key={task.id} activeId={activeId ?? ''} node={{...task, muted: true}} taskMode />)
          : null}
        {!hasIncompleteTasks && !hasVisibleCompletedTasks ? <div className={styles.emptyState}>No tasks yet</div> : null}
      </div>
    </aside>
  );
}
