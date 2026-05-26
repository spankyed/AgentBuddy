import {Icons} from '../primitives/Icon';
import {ComposerIconButton} from './ComposerIconButton';
import {ModePhaseSelector} from './ModePhaseSelector';
import {QuickPromptsPopup} from './QuickPromptsPopup';
import {SendButton} from './SendButton';
import type {ChatModeOption, QuickPromptState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

type ComposerActionBarProps = {
  disabled?: boolean;
  mode: string;
  modeOptions?: ChatModeOption[];
  openSelector?: 'mode' | 'phase';
  phase?: string;
  quickPrompts?: QuickPromptState[];
  quickPromptsOpen?: boolean;
  sendDisabled?: boolean;
  sendPressed?: boolean;
};

// Mirrors the button row in packages/renderer/src/plugins/threads/chat/input.vue.
export function ComposerActionBar({disabled, mode, modeOptions, openSelector, phase, quickPrompts, quickPromptsOpen, sendDisabled, sendPressed}: ComposerActionBarProps) {
  return (
    <div className={styles.actionBar}>
      <div className={styles.leftActions}>
        <ComposerIconButton disabled={disabled} icon={Icons.Hash} label="Add reference" />
        <ComposerIconButton disabled={disabled} icon={Icons.Paperclip} label="Attach file" />
        <span className={styles.quickPromptsAnchor}>
          <ComposerIconButton disabled={disabled} icon={Icons.Sparkle} label="Quick message" />
          {quickPromptsOpen ? <QuickPromptsPopup prompts={quickPrompts ?? []} /> : null}
        </span>
        <ComposerIconButton disabled={disabled} icon={Icons.Mic} label="Voice input" />
        <ModePhaseSelector disabled={disabled} mode={mode} modeOptions={modeOptions} openSelector={openSelector} phase={phase} />
      </div>
      <SendButton disabled={sendDisabled ?? disabled} pressed={sendPressed} />
    </div>
  );
}
