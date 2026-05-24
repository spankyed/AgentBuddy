import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import type {NoteTreeNodeState} from './noteTypes';
import './NoteTreeItem.module.css';

const styles = makeStyles('NoteTreeItem');

type NoteTreeItemProps = {
  activeId: string;
  depth?: number;
  key?: string;
  node: NoteTreeNodeState;
  taskMode?: boolean;
};

// Mirrors packages/renderer/src/plugins/notes/components/NoteTreeItem.vue.
export function NoteTreeItem({activeId, depth = 0, node, taskMode}: NoteTreeItemProps) {
  const isActive = node.id === activeId;
  const completed = Boolean(node.completed);
  const isTask = node.noteType === 'task';
  const children = node.children ?? [];
  return (
    <div>
      <div
        className={cx(styles.row, isActive && styles.active, taskMode && completed && styles.completed, node.muted && styles.muted)}
        style={{paddingLeft: depth * 8 + 8}}
      >
        <button className={styles.iconButton} type="button">
          {children.length > 0 ? <Icons.ChevronRight className={styles.chevronExpanded} size={16} /> : <NoteGlyph node={node} />}
        </button>
        <span className={cx(styles.title, completed && styles.titleCompleted)}>{node.title || 'Untitled'}</span>
        {taskMode && isTask ? (
          <>
            <RowActions />
            <TaskCheckbox completed={completed} />
          </>
        ) : (
          <RowActions />
        )}
      </div>
      {children.map(child => <NoteTreeItem key={child.id} activeId={activeId} depth={depth + 1} node={child} taskMode={taskMode} />)}
    </div>
  );
}

function NoteGlyph({node}: {node: NoteTreeNodeState}) {
  if (node.icon) return <span className={styles.emoji}>{node.icon}</span>;
  if (node.noteType === 'tasklist') return <Icons.Notes className={styles.neutralIcon} size={16} />;
  if (node.noteType === 'task') return <Icons.CircleCheck className={styles.neutralIcon} size={16} />;
  return <Icons.Notes className={styles.neutralIcon} size={16} />;
}

function RowActions() {
  return (
    <div className={styles.actionPill}>
      <button type="button"><Icons.MoreHorizontal size={13} /></button>
      <button type="button"><Icons.Plus size={13} /></button>
    </div>
  );
}

function TaskCheckbox({completed}: {completed: boolean}) {
  return (
    <button className={cx(styles.checkbox, completed && styles.checkboxChecked)} type="button">
      {completed ? <Icons.Check size={10} /> : null}
    </button>
  );
}
