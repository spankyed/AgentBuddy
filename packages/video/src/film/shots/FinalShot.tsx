import {interpolate} from 'remotion';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ease} from '../state/timeline';
import styles from './FinalShot.module.css';

export function FinalShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  return (
    <AppWindow activePlugin="brain" variant={variant} breadcrumbs={['AgentBuddy']} title="Launch Film" composer={false}>
      <div className={styles.root}>
        <h1 className={styles.title} style={{opacity: ease(frame, 24, 70), transform: `translateY(${interpolate(ease(frame, 24, 70), [0, 1], [20, 0])}px)`}}>AgentBuddy</h1>
        <p className={styles.sub} style={{opacity: ease(frame, 52, 94)}}>The AI operating system for modern work.</p>
      </div>
    </AppWindow>
  );
}

