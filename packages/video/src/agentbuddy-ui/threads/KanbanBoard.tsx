import type {ReactNode} from 'react';
import './KanbanBoard.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('KanbanBoard');

export function KanbanBoard({children}: {children: ReactNode}) {
  return <div className={styles.root}>{children}</div>;
}
