import type {CSSProperties, ReactNode} from 'react';
import {AttachmentStrip} from './AttachmentStrip';
import {BottomThreadTabs} from './BottomThreadTabs';
import {ComposerActionBar} from './ComposerActionBar';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

// Mirrors packages/renderer/src/plugins/threads/chat/input.vue.
export function ChatComposer({formStyle, outerStyle, state}: {formStyle?: CSSProperties; outerStyle?: CSSProperties; state: ChatComposerState}) {
  const hasTextContent = Boolean(state.text?.trim());
  const hasAttachments = Boolean(state.attachments?.length);
  const sendDisabled = state.disabled || (!hasTextContent && !hasAttachments);
  return (
    <footer className={styles.outer} style={outerStyle}>
      <form className={styles.form} style={formStyle}>
        <div className={styles.inputCard} data-onboarding-id="agent-chat-input">
          <AttachmentStrip attachments={state.attachments} />
          <div className={styles.editor}>
            <span className={state.text ? styles.text : styles.placeholder}>
              {state.text ? <ComposerText state={state} /> : state.placeholder}
            </span>
            {state.referenceAutocomplete ? <ReferenceAutocomplete state={state.referenceAutocomplete} /> : null}
          </div>
          <ComposerActionBar
            disabled={state.disabled}
            mode={state.mode}
            modeOptions={state.modeOptions}
            openSelector={state.openSelector}
            phase={state.phase}
            referenceButtonPressed={state.referenceButtonPressed}
            quickPrompts={state.quickPrompts}
            quickPromptsButtonPressed={state.quickPromptsButtonPressed}
            quickPromptsOpen={state.quickPromptsOpen}
            quickPromptPressedId={state.quickPromptPressedId}
            sendDisabled={sendDisabled}
            sendPressed={state.sendPressed}
          />
          {state.statusLine ? <div className={styles.statusLine}>{state.statusLine}</div> : null}
        </div>
      </form>
      {state.bottomTabs ? <BottomThreadTabs {...state.bottomTabs} /> : null}
    </footer>
  );
}

function ComposerText({state}: {state: ChatComposerState}) {
  const text = state.text ?? '';
  const references = state.references ?? [];
  if (references.length === 0) return <>{text}</>;

  const parts: Array<string | ReactNode> = [text];
  for (const reference of references) {
    const nextParts: Array<string | ReactNode> = [];
    for (const part of parts) {
      if (typeof part !== 'string') {
        nextParts.push(part);
        continue;
      }

      const tokenIndex = part.indexOf(reference.token);
      if (tokenIndex === -1) {
        nextParts.push(part);
        continue;
      }

      nextParts.push(part.slice(0, tokenIndex));
      nextParts.push(<ReferencePill key={reference.id} icon={reference.icon} label={reference.label} typeLabel={reference.typeLabel} />);
      nextParts.push(part.slice(tokenIndex + reference.token.length));
    }
    parts.splice(0, parts.length, ...nextParts);
  }

  return <>{parts}</>;
}

function ReferencePill({icon = '#', label, typeLabel}: {icon?: string; label: string; typeLabel?: string}) {
  return (
    <span className={styles.referencePill}>
      <span className={styles.referenceIcon}>{icon}</span>
      <span>{label}</span>
      {typeLabel ? <small>{typeLabel}</small> : null}
    </span>
  );
}

function ReferenceAutocomplete({state}: {state: NonNullable<ChatComposerState['referenceAutocomplete']>}) {
  return (
    <div className={styles.referenceAutocomplete}>
      <div className={styles.referenceSearch}>#{state.query}</div>
      {state.suggestions.map(suggestion => (
        <div className={suggestion.id === state.activeId ? styles.referenceSuggestionActive : styles.referenceSuggestion} key={suggestion.id}>
          <span className={styles.referenceIcon}>{suggestion.icon ?? '#'}</span>
          <span>{suggestion.label}</span>
          {suggestion.typeLabel ? <small>{suggestion.typeLabel}</small> : null}
        </div>
      ))}
    </div>
  );
}
