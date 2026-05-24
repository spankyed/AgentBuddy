import type {ComponentType} from 'react';
import {cx} from '../primitives/classNames';
import './Toolbar.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('Toolbar');

type ToolbarButtonProps = {
  active?: boolean;
  icon: ComponentType<{size?: number; className?: string}>;
  key?: string;
  label: string;
};

export function ToolbarButton({active, icon: Icon, label}: ToolbarButtonProps) {
  return (
    <div className={cx(styles.button, active && styles.active)} title={label}>
      <Icon size={24} />
    </div>
  );
}
