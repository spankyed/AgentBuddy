import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {ThinkingBlockState} from './threadTypes';
import './ThinkingBlock.module.css';

const styles = makeStyles('ThinkingBlock');

// Mirrors packages/renderer/src/plugins/threads/chat/interactions/blocks/ThinkingBlock.vue.
export function ThinkingBlock({state}: {state: ThinkingBlockState}) {
  const isOpen = state.defaultOpen !== false;
  return (
    <div className={styles.root}>
      <button className={styles.header} type="button">
        <Icons.ChevronRight className={isOpen ? styles.chevronOpen : styles.chevron} size={16} />
        <Icons.Brain className={styles.brain} size={16} />
        <span className={styles.label}>{state.label}</span>
        {state.state === 'streaming' ? (
          <span className={styles.streamingDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <div className={styles.content}>
          <pre>{state.content}</pre>
        </div>
      ) : null}
    </div>
  );
}
