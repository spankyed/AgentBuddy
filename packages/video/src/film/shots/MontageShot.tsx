import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ease, mix} from '../state/timeline';
import './MontageShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
const styles = makeStyles('MontageShot');

export function MontageShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const items = ['Memory graph updated', 'Execution stream visible', 'Knowledge query returned', 'Defaults personalized', 'Threads dashboard', 'Workflow completed'];
  const active = Math.min(items.length - 1, Math.floor(frame / 58));
  return (
    <AppWindow activePlugin="brain" variant={variant} breadcrumbs={['System', 'Montage']}>
      <div className={styles.grid}>
        {items.map((item, index) => (
          <div key={item} className={index === active ? styles.activeCard : styles.card}>
            <small>0{index + 1}</small>
            <strong>{item}</strong>
            <span className={styles.progress} style={{width: index === active ? `${mix(8, 100, ease(frame % 58, 0, 48))}%` : '14%'}} />
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

