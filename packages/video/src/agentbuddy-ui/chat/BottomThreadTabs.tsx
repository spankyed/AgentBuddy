import {Icons} from '../primitives/Icon';
import styles from './ChatComposer.module.css';

export function BottomThreadTabs({activeLabel = 'AgentBuddy launch film'}: {activeLabel?: string}) {
  return (
    <div className={styles.bottomTabs}>
      <span><Icons.Clock size={14} />Recent Threads</span>
      <span><Icons.Square size={14} />{activeLabel}</span>
      <span><Icons.Plus size={14} />New thread</span>
    </div>
  );
}

