import {Icons} from '../primitives/Icon';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

export function BottomThreadTabs({activeLabel = 'AgentBuddy launch film'}: {activeLabel?: string}) {
  return (
    <div className={styles.bottomTabs}>
      <span><Icons.Clock size={14} />Recent Threads</span>
      <span><Icons.Square size={14} />{activeLabel}</span>
      <span><Icons.Plus size={14} />New thread</span>
    </div>
  );
}

