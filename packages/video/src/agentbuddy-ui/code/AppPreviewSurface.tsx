import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './AppPreviewSurface.module.css';

const styles = makeStyles('AppPreviewSurface');

export function AppPreviewSurface() {
  return (
    <section className={styles.root}>
      <div className={styles.tabs}>
        <div className={styles.tab}><Icons.ExternalLink size={13} /> localhost:5173</div>
      </div>
      <div className={styles.preview}>
        <div className={styles.browserBar}>
          <div className={styles.traffic}><span /><span /><span /></div>
          <div className={styles.address}>127.0.0.1:5173</div>
        </div>
        <main className={styles.page}>
          <p>launch preview</p>
          <h1>AgentBuddy</h1>
        </main>
      </div>
    </section>
  );
}
