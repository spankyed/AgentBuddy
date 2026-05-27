import type {ChatComposerState} from './chatTypes';
import {Icons} from '../primitives/Icon';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

type BottomThreadTabsProps = NonNullable<ChatComposerState['bottomTabs']>;

export function BottomThreadTabs({active = 'active', activeLabel, activePinned, newThreadLabel, pressed, recentLabel, recentThreadsMenu}: BottomThreadTabsProps) {
  return (
    <div className={styles.bottomTabs}>
      <div className={styles.bottomTabSlot} data-slot="recent">
        <button data-active={active === 'recent'} data-pressed={pressed === 'recent'} type="button">
          <Icons.Clock size={14} /><span>{recentLabel}</span>
        </button>
        {recentThreadsMenu ? <RecentThreadsMenu menu={recentThreadsMenu} /> : null}
      </div>
      <div className={styles.bottomTabSlot} data-slot="active">
        <button data-active={active === 'active'} data-pressed={pressed === 'active'} type="button">
        <Icons.PanelLeft size={14} />
        <span>{activeLabel}</span>
        {activePinned ? <Icons.Pin className={styles.bottomTabPinnedIcon} size={12} /> : null}
        </button>
      </div>
      <div className={styles.bottomTabSlot} data-slot="new">
        <button data-active={active === 'new'} data-pressed={pressed === 'new'} type="button"><Icons.Plus size={14} /><span>{newThreadLabel}</span></button>
      </div>
    </div>
  );
}

function RecentThreadsMenu({menu}: {menu: NonNullable<BottomThreadTabsProps['recentThreadsMenu']>}) {
  return (
    <div className={styles.recentThreadsMenu}>
      {menu.threads.map(thread => (
        <div className={thread.id === menu.activeId ? styles.recentThreadActive : styles.recentThread} data-current={thread.status === 'active'} key={thread.id}>
          <span className={thread.status === 'active' ? styles.recentThreadDotActive : styles.recentThreadDot} />
          <div className={styles.recentThreadTitle}>
            <span>{thread.title}</span>
          </div>
          <button className={styles.recentThreadPinButton} type="button">
            <Icons.Pin className={thread.pinned ? styles.recentThreadPinActive : styles.recentThreadPin} size={12} />
          </button>
          <small className={styles.recentThreadTime}>{thread.time}</small>
          <div className={styles.recentThreadActions}>
            <button type="button"><Icons.FileText size={12} />Details</button>
            <button type="button"><Icons.PanelLeft size={12} />Artifacts</button>
            <button type="button"><Icons.Archive size={12} />Archive</button>
          </div>
        </div>
      ))}
    </div>
  );
}
