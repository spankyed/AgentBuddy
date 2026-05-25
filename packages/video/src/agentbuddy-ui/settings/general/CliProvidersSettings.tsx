import './CliProvidersSettings.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const styles = makeStyles('CliProvidersSettings');

const providers = [
  {installHint: 'Install via npm', key: 'copilot', label: 'Copilot CLI', value: ''},
  {installHint: 'Install via npm', key: 'claude-code', label: 'Claude Code CLI', value: '/opt/homebrew/bin/claude'},
  {installHint: 'Install via npm', key: 'codex', label: 'Codex CLI', value: '/opt/homebrew/bin/codex'},
  {installHint: 'Install via Homebrew', key: 'gh', label: 'GitHub CLI', value: '/opt/homebrew/bin/gh'},
];

export function CliProvidersSettings() {
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h3 className={styles.title}>CLI Providers</h3>
        <p className={styles.description}>Leave path blank to auto-detect. Click Test to verify and resolve.</p>
      </header>
      <div className={styles.list}>
        {providers.map(provider => (
          <div className={styles.row} key={provider.key}>
            <div className={styles.provider}>
              <div className={styles.label}>{provider.label}</div>
              <div className={styles.hint}>{provider.installHint}</div>
            </div>
            <input className={styles.input} readOnly placeholder="Path override (auto-detected if empty)" value={provider.value} />
            <button className={styles.test} type="button">Test</button>
          </div>
        ))}
      </div>
    </section>
  );
}
