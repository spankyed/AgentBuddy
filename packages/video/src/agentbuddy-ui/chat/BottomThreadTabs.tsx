import {Icons} from '../primitives/Icon';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

type BottomThreadTabsProps = NonNullable<ChatComposerState['bottomTabs']>;

export function BottomThreadTabs({active = 'active', activeLabel, activePinned, newThreadLabel, pressed, recentLabel, recentThreadsMenu}: BottomThreadTabsProps) {
  return (
    <div className={styles.bottomTabs}>
      <button data-active={active === 'recent'} data-pressed={pressed === 'recent'} type="button">
        <Icons.Clock size={14} />{recentLabel}
      </button>
      {recentThreadsMenu ? <RecentThreadsMenu menu={recentThreadsMenu} /> : null}
      <button data-active={active === 'active'} data-pressed={pressed === 'active'} type="button">
        {activePinned ? <Icons.Star size={14} /> : <Icons.Square size={14} />}
        {activeLabel}
      </button>
      <button data-active={active === 'new'} data-pressed={pressed === 'new'} type="button"><Icons.Plus size={14} />{newThreadLabel}</button>
    </div>
  );
}

function RecentThreadsMenu({menu}: {menu: NonNullable<BottomThreadTabsProps['recentThreadsMenu']>}) {
  return (
    <div className={styles.recentThreadsMenu}>
      <div className={styles.recentThreadsHeader}>Recent Threads</div>
      {menu.threads.map(thread => (
        <div className={thread.id === menu.activeId ? styles.recentThreadActive : styles.recentThread} key={thread.id}>
          <div>
            <strong>{thread.title}</strong>
            {thread.meta ? <small>{thread.meta}</small> : null}
          </div>
          {thread.status ? <span>{thread.status}</span> : null}
        </div>
      ))}
    </div>
  );
}
