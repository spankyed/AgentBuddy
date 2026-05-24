import type {ReactNode} from 'react';
import styles from './KanbanBoard.module.css';

export function KanbanBoard({children}: {children: ReactNode}) {
  return <div className={styles.root}>{children}</div>;
}

export function KanbanColumn({title, count, children}: {children?: ReactNode; count: number; title: string}) {
  return (
    <section className={styles.column}>
      <header className={styles.header}><span>{title}</span><small>{count}</small></header>
      {children}
    </section>
  );
}

export function TaskCard({active, children, muted}: {active?: boolean; children: ReactNode; muted?: boolean}) {
  return <div className={active ? styles.activeTask : styles.task} style={{opacity: muted ? 0.55 : 1}}>{children}<small>launch</small></div>;
}

