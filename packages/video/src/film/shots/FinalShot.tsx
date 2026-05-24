import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {finalShotState, finalViewForFrame} from '../state/final';
import './FinalShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import {useAppWindowLayout} from '../appWindowLayout';
const styles = makeStyles('FinalShot');

export function FinalShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = finalViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="brain" breadcrumbs={finalShotState.breadcrumbs} title={finalShotState.titleBar} composer={false} layout={layout}>
      <div className={styles.root}>
        <h1 className={styles.title} style={view.titleStyle}>{finalShotState.brand}</h1>
        <p className={styles.sub} style={view.taglineStyle}>{finalShotState.tagline}</p>
      </div>
    </AppWindow>
  );
}
