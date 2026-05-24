import type {CSSProperties, ReactNode} from 'react';
import './ThreadCard.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ThreadCard');

export function ThreadCard({children, className = '', style}: {children: ReactNode; className?: string; style?: CSSProperties}) {
  return <div className={`${styles.card} ${className}`} style={style}>{children}</div>;
}
