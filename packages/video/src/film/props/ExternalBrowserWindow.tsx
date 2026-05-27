import {Icons} from '../../agentbuddy-ui/primitives/Icon';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './ExternalBrowserWindow.module.css';

const styles = makeStyles('ExternalBrowserWindow');

// Film-only prop for a launched local app. This intentionally does not live in
// agentbuddy-ui because it is not an AgentBuddy renderer component.
export function ExternalBrowserWindow() {
  return (
    <div className={styles.window}>
      <div className={styles.titlebar}>
        <div className={styles.trafficLights}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.address}>
          <Icons.ExternalLink size={13} />
          <span>localhost:5173</span>
        </div>
      </div>
      <main className={styles.page}>
        <p>Local app preview</p>
        <h1>&ldquo;anti-gravity&rdquo; sucks</h1>
      </main>
    </div>
  );
}
