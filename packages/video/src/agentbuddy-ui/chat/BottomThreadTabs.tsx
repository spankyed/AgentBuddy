import {Icons} from '../primitives/Icon';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

type BottomThreadTabsProps = NonNullable<ChatComposerState['bottomTabs']>;

export function BottomThreadTabs({active = 'active', activeLabel, activePinned, newThreadLabel, pressed, recentLabel}: BottomThreadTabsProps) {
  return (
    <div className={styles.bottomTabs}>
      <span data-active={active === 'recent'} data-pressed={pressed === 'recent'}><Icons.Clock size={14} />{recentLabel}</span>
      <span data-active={active === 'active'} data-pressed={pressed === 'active'}>
        {activePinned ? <Icons.Star size={14} /> : <Icons.Square size={14} />}
        {activeLabel}
      </span>
      <span data-active={active === 'new'} data-pressed={pressed === 'new'}><Icons.Plus size={14} />{newThreadLabel}</span>
    </div>
  );
}
