import {ease} from '../../film/state/timeline';
import './AgentWorkList.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('AgentWorkList');

export function AgentWorkList({frame, items}: {frame: number; items: string[]}) {
  return (
    <div>
      <div className={styles.muted}>Agent is working</div>
      {items.map((line, index) => (
        <div key={line} className={styles.line} style={{opacity: ease(frame, 104 + index * 20, 122 + index * 20)}}>
          <span className={index === 3 ? styles.warnDot : styles.dot} />
          <p>{line}</p>
        </div>
      ))}
    </div>
  );
}

