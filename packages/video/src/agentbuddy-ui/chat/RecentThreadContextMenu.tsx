import {Icons} from '../primitives/Icon';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

// Mirrors packages/renderer/src/plugins/threads/canvas/components/thread-context-menu.vue.
export function RecentThreadContextMenu({copyText, isArchived, isPinned}: {copyText: string; isArchived: boolean; isPinned: boolean}) {
  return (
    <div className={styles.threadContextMenu} data-copy-text={copyText}>
      <button className={styles.threadContextMenuItem} type="button">
        <Icons.Pencil className={styles.threadContextMenuNeutralIcon} size={14} />
        <span>Rename</span>
      </button>
      <button className={styles.threadContextMenuItem} type="button">
        <Icons.Copy className={styles.threadContextMenuNeutralIcon} size={14} />
        <span>Copy Id</span>
      </button>
      <div className={styles.threadContextMenuSeparator} />
      <button className={styles.threadContextMenuItem} type="button">
        <Icons.Pin className={styles.threadContextMenuNeutralIcon} size={14} />
        <span>{isPinned ? 'Unpin' : 'Pin'}</span>
      </button>
      {isArchived ? (
        <button className={styles.threadContextMenuItem} type="button">
          <Icons.ArchiveRestore className={styles.threadContextMenuArchiveIcon} size={14} />
          <span>Unarchive</span>
        </button>
      ) : !isPinned ? (
        <button className={styles.threadContextMenuItem} type="button">
          <Icons.Archive className={styles.threadContextMenuArchiveIcon} size={14} />
          <span>Archive</span>
        </button>
      ) : null}
      <div className={styles.threadContextMenuSeparator} />
      <button className={styles.threadContextMenuDeleteItem} type="button">
        <Icons.Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
  );
}
