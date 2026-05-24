import {ease} from '../../film/state/timeline';
import './ArtifactChecklist.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ArtifactChecklist');

export function ArtifactChecklist({frame, rows}: {frame: number; rows: string[]}) {
  return (
    <div>
      <div className={styles.head}><span>Launch Operating Plan</span><small>artifact</small></div>
      {rows.map((row, index) => (
        <div key={row} className={styles.row} style={{opacity: ease(frame, 188 + index * 16, 204 + index * 16)}}>
          <span>{row}</span>
          <small className={index < 2 ? styles.done : index === 2 ? styles.active : ''}>{index < 2 ? 'done' : index === 2 ? 'active' : 'queued'}</small>
        </div>
      ))}
    </div>
  );
}

