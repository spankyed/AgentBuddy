import type {CSSProperties, ReactNode} from 'react';
import {cx} from '../agentbuddy-ui/primitives/classNames';
import {makeStyles} from '../agentbuddy-ui/primitives/makeStyles';
import './DemoLayout.module.css';

const styles = makeStyles('DemoLayout');

type DemoSlotProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function DemoSlot({children, className, style}: DemoSlotProps) {
  return <div className={cx(styles.slot, className)} style={style}>{children}</div>;
}

export function DemoBottomSlot({children}: {children: ReactNode}) {
  return <DemoSlot className={styles.bottom}>{children}</DemoSlot>;
}

export function DemoPanelSlot({children, side = 'left', width}: {children: ReactNode; side?: 'left' | 'right'; width?: number}) {
  return <DemoSlot className={side === 'right' ? styles.rightPanel : styles.leftPanel} style={width ? {width} : undefined}>{children}</DemoSlot>;
}

export function DemoFramedArea({children}: {children: ReactNode}) {
  return <DemoSlot className={styles.framedArea}>{children}</DemoSlot>;
}

export function DemoHeaderArea({children}: {children: ReactNode}) {
  return <DemoSlot className={styles.headerArea}>{children}</DemoSlot>;
}

export function DemoBoardArea({children}: {children: ReactNode}) {
  return <DemoSlot className={styles.boardArea}>{children}</DemoSlot>;
}
