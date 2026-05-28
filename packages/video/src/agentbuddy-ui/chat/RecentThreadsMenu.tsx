import type {CSSProperties} from 'react';
import type {ChatComposerState} from './chatTypes';
import {RecentThreadContextMenu} from './RecentThreadContextMenu';
import {RecentThreadRow} from './RecentThreadRow';
import {Icons} from '../primitives/Icon';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type RecentThreadsMenuState = NonNullable<NonNullable<ChatComposerState['bottomTabs']>['recentThreadsMenu']>;

// Mirrors packages/renderer/src/plugins/threads/chat/recent-threads.vue.
export function RecentThreadsMenu({menu}: {menu: RecentThreadsMenuState}) {
  const contextThread = menu.contextMenu
    ? menu.threads.find(thread => thread.id === menu.contextMenu?.threadId)
    : undefined;
  const contextThreadIndex = contextThread ? menu.threads.findIndex(thread => thread.id === contextThread.id) : -1;
  const contextBottomOffset = 8 + 4 + Math.max(0, menu.threads.length - contextThreadIndex - 1) * 40;
  const archiveContextThread = menu.archiveContextMenuThreadId
    ? menu.threads.find(thread => thread.id === menu.archiveContextMenuThreadId)
    : undefined;
  const archiveContextThreadIndex = archiveContextThread ? menu.threads.findIndex(thread => thread.id === archiveContextThread.id) : -1;
  const archiveContextBottomOffset = 8 + 4 + Math.max(0, menu.threads.length - archiveContextThreadIndex - 1) * 40;

  return (
    <>
      <div className={styles.recentThreadsMenu}>
        {menu.threads.length === 0 ? (
          <div className={styles.recentThreadsEmpty}>
            <Icons.History size={20} />
            <p>No threads yet</p>
            <small>Recent threads will appear here</small>
          </div>
        ) : (
          <div className={styles.recentThreadsList}>
            {menu.threads.map((thread, index) => (
              <RecentThreadRow
                active={menu.activeId ? thread.id === menu.activeId : index === 0}
                current={thread.id === menu.currentId}
                editingName={menu.editingName}
                editingThreadId={menu.editingThreadId}
                key={thread.id}
                thread={thread}
              />
            ))}
          </div>
        )}
      </div>
      {contextThread ? (
        <div
          className={styles.threadContextMenuPortal}
          style={{bottom: `calc(100% + ${contextBottomOffset}px)`} as CSSProperties}
        >
          <RecentThreadContextMenu
            copyText={menu.contextMenu?.copyText ?? contextThread.id}
            isArchived={menu.contextMenu?.isArchived ?? false}
            isPinned={!!contextThread.pinned}
          />
        </div>
      ) : null}
      {archiveContextThread ? (
        <div
          className={styles.archiveDeleteMenuPortal}
          style={{bottom: `calc(100% + ${archiveContextBottomOffset}px)`} as CSSProperties}
        >
          <ArchiveDeleteMenu />
        </div>
      ) : null}
    </>
  );
}

function ArchiveDeleteMenu() {
  return (
    <div className={styles.archiveDeleteMenu}>
      <button className={styles.archiveDeleteMenuItem} type="button">
        <Icons.Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
  );
}
