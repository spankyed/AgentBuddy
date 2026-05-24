import type {ReactNode} from 'react';
import styles from './NoteEditor.module.css';

type NoteEditorProps = {
  afterLines: ReactNode[];
  beforeLines: ReactNode[];
  path: string;
};

export function NoteEditor({afterLines, beforeLines, path}: NoteEditorProps) {
  return (
    <article className={styles.root}>
      <div className={styles.path}>{path}</div>
      <ul className={styles.list}>{beforeLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
      <div className={styles.rule} />
      <ul className={`${styles.list} ${styles.connected}`}>{afterLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </article>
  );
}

