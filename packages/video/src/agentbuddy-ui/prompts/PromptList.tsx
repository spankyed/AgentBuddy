import {cx} from '../primitives/classNames';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {PromptSurfaceState} from './promptTypes';
import './PromptList.module.css';

const styles = makeStyles('PromptList');

export function PromptList({state}: {state: PromptSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>
        <span>Prompts</span>
        <Icons.Plus size={15} />
      </header>
      <div className={styles.list}>
        {state.prompts.map(prompt => (
          <div key={prompt.id} className={cx(styles.item, prompt.id === state.activePromptId && styles.active)}>
            <div className={styles.title}>{prompt.title}</div>
            <div className={styles.meta}>{prompt.model} · {prompt.updatedAt}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
