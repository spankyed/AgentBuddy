import {interpolate} from 'remotion';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {finalShotState} from '../state/final';
import {ease} from '../state/timeline';
import './FinalShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
const styles = makeStyles('FinalShot');

export function FinalShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  return (
    <AppWindow activePlugin="brain" variant={variant} breadcrumbs={finalShotState.breadcrumbs} title={finalShotState.titleBar} composer={false}>
      <div className={styles.root}>
        <h1 className={styles.title} style={{opacity: ease(frame, 24, 70), transform: `translateY(${interpolate(ease(frame, 24, 70), [0, 1], [20, 0])}px)`}}>{finalShotState.brand}</h1>
        <p className={styles.sub} style={{opacity: ease(frame, 52, 94)}}>{finalShotState.tagline}</p>
      </div>
    </AppWindow>
  );
}
