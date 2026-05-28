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
  forcedMode?: string;
  mode: string;
  modeOptions?: ChatModeOption[];
  openSelector?: 'mode' | 'phase';
  phase?: string;
  busy?: boolean;
  referenceButtonPressed?: boolean;
  quickPrompts?: QuickPromptState[];
  quickPromptsButtonPressed?: boolean;
  quickPromptsEditing?: boolean;
  quickPromptsEditingId?: string;
  quickPromptsEditingText?: string;
  quickPromptsNewText?: string;
  quickPromptsOpen?: boolean;
  quickPromptPressedId?: string;
  recording?: boolean;
  sendDisabled?: boolean;
  sendPressed?: boolean;
  speechSupported?: boolean;
};

// Mirrors the button row in packages/renderer/src/plugins/threads/chat/input.vue.
export function ComposerActionBar({busy, disabled, forcedMode, mode, modeOptions, openSelector, phase, quickPrompts, quickPromptsButtonPressed, quickPromptsEditing, quickPromptsEditingId, quickPromptsEditingText, quickPromptsNewText, quickPromptsOpen, quickPromptPressedId, recording, referenceButtonPressed, sendDisabled, sendPressed, speechSupported = true}: ComposerActionBarProps) {
  return (
    <div className={styles.actionBar}>
      <div className={styles.leftActions}>
        <ComposerIconButton disabled={disabled} icon={Icons.Hash} label="Add reference" pressed={referenceButtonPressed} />
        <ComposerIconButton disabled={disabled} icon={Icons.Paperclip} label="Attach file" />
        <span className={styles.quickPromptsAnchor}>
          <ComposerIconButton disabled={disabled} icon={Icons.Sparkle} label="Quick message" pressed={quickPromptsButtonPressed} />
          {quickPromptsOpen ? (
            <QuickPromptsPopup
              editing={quickPromptsEditing}
              editingId={quickPromptsEditingId}
              editingText={quickPromptsEditingText}
              newPromptText={quickPromptsNewText}
              pressedPromptId={quickPromptPressedId}
              prompts={quickPrompts ?? []}
            />
          ) : null}
        </span>
        {speechSupported ? <ComposerIconButton className={recording ? styles.recordingButton : undefined} disabled={disabled} icon={recording ? Icons.MicOff : Icons.Mic} label={recording ? 'Stop listening' : 'Voice input'} /> : null}
        <ModePhaseSelector disabled={disabled} forcedMode={forcedMode} mode={mode} modeOptions={modeOptions} openSelector={openSelector} phase={phase} />
      </div>
      <div className={styles.rightActions}>
        {busy ? (
          <button className={styles.pauseButton} type="button" title="Pause agent work">
            <span>Pause</span>
            <PauseGlyph />
          </button>
        ) : null}
        <SendButton disabled={sendDisabled ?? disabled} pressed={sendPressed} />
      </div>
    </div>
  );
}

function PauseGlyph() {
  return (
    <svg aria-hidden="true" className={styles.pauseIcon} fill="none" height="22" viewBox="0 0 24 24" width="22">
      <rect fill="currentColor" height="12" rx="1" width="4" x="6" y="6" />
      <rect fill="currentColor" height="12" rx="1" width="4" x="14" y="6" />
    </svg>
  );
}
