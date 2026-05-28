import type {ChatComposerState} from './chatTypes';
import {Icons} from '../primitives/Icon';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type RecentThreadsMenuState = NonNullable<NonNullable<ChatComposerState['bottomTabs']>['recentThreadsMenu']>;
export type RecentThreadRowState = RecentThreadsMenuState['threads'][number];

type RecentThreadRowProps = {
  active?: boolean;
  current?: boolean;
  editingName?: string;
  editingThreadId?: string;
  thread: RecentThreadRowState;
};

// Mirrors the row body in packages/renderer/src/plugins/threads/chat/recent-threads.vue.
export function RecentThreadRow({active, current, editingName, editingThreadId, thread}: RecentThreadRowProps) {
  const dotStyle = thread.busy || !thread.dotColor ? undefined : {backgroundColor: thread.dotColor};
  const editing = thread.id === editingThreadId;

  return (
    <div className={active ? styles.recentThreadActive : styles.recentThread} data-current={current ? 'true' : undefined} data-pinned={thread.pinned ? 'true' : undefined}>
      <span className={styles.recentThreadDotWrap}>
        <span className={thread.busy ? styles.recentThreadDotBusy : styles.recentThreadDot} style={dotStyle} />
        {thread.busy ? <span className={styles.recentThreadDotGlow} /> : null}
      </span>
      {editing ? (
        <input className={styles.recentThreadRenameInput} readOnly value={editingName ?? thread.title ?? ''} />
      ) : (
        <div className={styles.recentThreadTitle}>
          <span>{thread.title || 'Untitled'}</span>
        </div>
      )}
      <button className={styles.recentThreadPinButton} type="button">
        <Icons.Pin className={thread.pinned ? styles.recentThreadPinActive : styles.recentThreadPin} size={12} />
      </button>
      <small className={styles.recentThreadTime}>{thread.time}</small>
      <div className={styles.recentThreadActions}>
        <button type="button"><Icons.FileText size={12} />Details</button>
        <button type="button"><Icons.PanelLeft size={12} />Artifacts</button>
        {thread.pinned ? (
          <span className={styles.recentThreadArchivePlaceholder}><Icons.Archive size={12} />Archive</span>
        ) : (
          <button className={styles.recentThreadArchiveButton} type="button"><Icons.Archive size={12} />Archive</button>
        )}
      </div>
    </div>
  );
}
