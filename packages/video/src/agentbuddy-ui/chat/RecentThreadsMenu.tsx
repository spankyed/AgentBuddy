import type {CSSProperties} from 'react';
import type {ChatComposerState} from './chatTypes';
import {RecentThreadContextMenu} from './RecentThreadContextMenu';
import {RecentThreadRow} from './RecentThreadRow';
import {Icons} from '../primitives/Icon';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type RecentThreadsMenuState = NonNullable<NonNullable<ChatComposerState['bottomTabs']>['recentThreadsMenu']>;

const rendererRecentThreadRowHeight = 36;
const rendererContextMenuSideOffset = 2;

// Mirrors packages/renderer/src/plugins/threads/chat/recent-threads.vue.
export function RecentThreadsMenu({menu}: {menu: RecentThreadsMenuState}) {
  const contextThread = menu.contextMenu
    ? menu.threads.find(thread => thread.id === menu.contextMenu?.threadId)
    : undefined;
  const contextThreadIndex = contextThread ? menu.threads.findIndex(thread => thread.id === contextThread.id) : -1;
  const contextBottomOffset = 8 + rendererContextMenuSideOffset + Math.max(0, menu.threads.length - contextThreadIndex - 1) * rendererRecentThreadRowHeight;
  const archiveContextThread = menu.archiveContextMenuThreadId
    ? menu.threads.find(thread => thread.id === menu.archiveContextMenuThreadId)
    : undefined;
  const archiveContextThreadIndex = archiveContextThread ? menu.threads.findIndex(thread => thread.id === archiveContextThread.id) : -1;
  const archiveContextBottomOffset = Math.max(
    0,
    Math.max(0, menu.threads.length - archiveContextThreadIndex - 1) * rendererRecentThreadRowHeight - 8,
  );

  return (
    <>
      <div className={styles.recentThreadsMenu} style={recentThreadsMenuStyle(menu.popupPosition)}>
        {menu.threads.length === 0 ? (
          <div className={styles.recentThreadsEmpty}>
            <Icons.History size={20} />
            <p>No threads yet</p>
            <small>Recent threads will appear here</small>
          </div>
        ) : (
          <div className={styles.recentThreadsList}>
            {menu.threads.map(thread => (
              <RecentThreadRow
                active={thread.id === menu.activeId}
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
          style={contextMenuPortalStyle(menu.popupPosition, contextBottomOffset, 160)}
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
          style={contextMenuPortalStyle(menu.popupPosition, archiveContextBottomOffset, 120)}
        >
          <ArchiveDeleteMenu />
        </div>
      ) : null}
    </>
  );
}

function recentThreadsMenuStyle(position: RecentThreadsMenuState['popupPosition']): CSSProperties | undefined {
  if (!position) {
    return undefined;
  }

  return {
    bottom: `${position.bottom}px`,
    left: `${position.left}px`,
    position: 'fixed',
    width: `${position.width}px`,
  };
}

function contextMenuPortalStyle(
  position: RecentThreadsMenuState['popupPosition'],
  bottomOffset: number,
  menuWidth: number,
): CSSProperties {
  if (!position) {
    return {
      bottom: `calc(100% + ${bottomOffset}px)`,
      position: 'absolute',
      right: '0.5rem',
      width: `${menuWidth}px`,
    };
  }

  return {
    bottom: `${position.bottom + bottomOffset}px`,
    left: `${position.left + position.width - menuWidth - 8}px`,
    position: 'fixed',
    right: 'auto',
  };
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
