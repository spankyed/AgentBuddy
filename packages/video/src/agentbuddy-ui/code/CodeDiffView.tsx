import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import './CodeDiffView.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('CodeDiffView');

type DiffLine = {
  kind: 'add' | 'remove' | 'context';
  text: string;
};

export function CodeDiffView({fileName, lineOpacities, lineStart, lines}: {fileName: string; lineOpacities?: number[]; lineStart: number; lines: DiffLine[]}) {
  return (
    <section className={styles.root}>
      <div className={styles.tabs}>
        <div className={styles.tab}><Icons.File size={13} /> {fileName}</div>
      </div>
      <div className={styles.editor}>
        {lines.map((line, index) => (
          <div
            key={`${line.kind}-${line.text}`}
            className={cx(styles.line, line.kind === 'add' && styles.add, line.kind === 'remove' && styles.remove)}
            style={{opacity: lineOpacities?.[index] ?? 1}}
          >
            <span className={styles.number}>{index + lineStart}</span>
            <span className={styles.code}>{prefixFor(line.kind)} {line.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function prefixFor(kind: DiffLine['kind']) {
  if (kind === 'add') return '+';
  if (kind === 'remove') return '-';
  return ' ';
}
