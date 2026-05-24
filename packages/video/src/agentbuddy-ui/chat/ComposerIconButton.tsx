import type {ComponentType} from 'react';
import {cx} from '../primitives/classNames';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

type ComposerIconButtonProps = {
  className?: string;
  icon: ComponentType<{size?: number; className?: string}>;
  label: string;
};

export function ComposerIconButton({className, icon: Icon, label}: ComposerIconButtonProps) {
  return (
    <button className={cx(styles.iconButton, className)} title={label} type="button">
      <Icon size={20} />
    </button>
  );
}

