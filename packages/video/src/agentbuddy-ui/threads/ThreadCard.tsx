import type {ReactNode} from 'react';
import styles from './ThreadCard.module.css';

export function ThreadCard({children, className = '', style}: {children: ReactNode; className?: string; style?: React.CSSProperties}) {
  return <div className={`${styles.card} ${className}`} style={style}>{children}</div>;
}

