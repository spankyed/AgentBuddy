import type {ComponentType} from 'react';
import {cx} from '../primitives/classNames';
import styles from './Toolbar.module.css';

type ToolbarButtonProps = {
  active?: boolean;
  icon: ComponentType<{size?: number; className?: string}>;
  label: string;
};

export function ToolbarButton({active, icon: Icon, label}: ToolbarButtonProps) {
  return (
    <div className={cx(styles.button, active && styles.active)} title={label}>
      <Icon size={24} />
    </div>
  );
}

