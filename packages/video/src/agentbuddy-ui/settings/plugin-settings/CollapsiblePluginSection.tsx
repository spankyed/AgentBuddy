import {Icons} from '../../primitives/Icon';
import './CollapsiblePluginSection.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const styles = makeStyles('CollapsiblePluginSection');

export function CollapsiblePluginSection({children, label}: {children: React.ReactNode; label: string}) {
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <span>{label}</span>
        <Icons.ChevronDown size={16} />
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
