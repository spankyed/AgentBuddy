import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './HelpSettingsTab.module.css';

const styles = makeStyles('HelpSettingsTab');

export function HelpSettingsTab() {
  return (
    <div className={styles.root}>
      <main className={styles.content}>
        <div className={styles.inner}>
          <h2 className={styles.title}>Frequently Asked Questions</h2>
          <section className={styles.card}>
            <div className={styles.question}>How do setup packs work?<Icons.ChevronDown size={16} /></div>
            <div className={styles.answer}>Setup packs import compiled actions, prompts, flows, library docs, notes, and settings.</div>
          </section>
        </div>
      </main>
      <footer className={styles.footer}>
        <p>Join our Discord community</p>
        <p>Developed in memory of Kathie Lovett Ulrich</p>
      </footer>
    </div>
  );
}
