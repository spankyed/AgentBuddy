import {makeStyles} from '../primitives/makeStyles';
import type {LibrarySurfaceState} from './libraryTypes';
import './LibraryPreview.module.css';

const styles = makeStyles('LibraryPreview');

export function LibraryPreview({state}: {state: LibrarySurfaceState}) {
  return (
    <article className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>{state.preview.title}</div>
        <div className={styles.meta}>
          {state.preview.metadata.map(item => <span key={item.label}>{item.label}: {item.value}</span>)}
        </div>
      </header>
      <div className={styles.body}>
        {state.preview.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </article>
  );
}
