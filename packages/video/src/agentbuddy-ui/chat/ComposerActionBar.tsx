import {Icons} from '../primitives/Icon';
import {ComposerIconButton} from './ComposerIconButton';
import {ModePhaseSelector} from './ModePhaseSelector';
import {SendButton} from './SendButton';
import styles from './ChatComposer.module.css';

type ComposerActionBarProps = {
  disabled?: boolean;
  mode: string;
  phase?: string;
};

// Mirrors the button row in packages/renderer/src/plugins/threads/chat/input.vue.
export function ComposerActionBar({disabled, mode, phase}: ComposerActionBarProps) {
  return (
    <div className={styles.actionBar}>
      <div className={styles.leftActions}>
        <ComposerIconButton icon={Icons.Hash} label="Reference" />
        <ComposerIconButton icon={Icons.Paperclip} label="Attach file" />
        <ComposerIconButton icon={Icons.Sparkle} label="Quick prompts" />
        <ComposerIconButton icon={Icons.Mic} label="Voice input" />
        <ModePhaseSelector mode={mode} phase={phase} />
      </div>
      <SendButton disabled={disabled} />
    </div>
  );
}

