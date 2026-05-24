import type {ReactNode} from 'react';
import './NoteEditor.module.css';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTitleRow} from './NoteTitleRow';
const styles = makeStyles('NoteEditor');

type NoteEditorProps = {
  afterLines: ReactNode[];
  beforeLines: ReactNode[];
};

export function NoteEditor({afterLines, beforeLines}: NoteEditorProps) {
  return (
    <article className={styles.root}>
      <div className={styles.scroller}>
        <NoteTitleRow icon="🔥" title="current" />
        <div className={styles.editor}>
          <ul className={styles.list}>{beforeLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
          <div className={styles.rule} />
          <ul className={`${styles.list} ${styles.connected}`}>{afterLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </div>
      </div>
    </article>
  );
}
