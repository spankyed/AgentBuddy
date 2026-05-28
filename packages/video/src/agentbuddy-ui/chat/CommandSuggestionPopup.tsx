import type {CSSProperties} from 'react';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type CommandSuggestionState = NonNullable<ChatComposerState['commandSuggestion']>;

// Mirrors packages/renderer/src/core/components/tiptap/CommandSuggestionPopup.vue.
export function CommandSuggestionPopup({state}: {state: CommandSuggestionState}) {
  return (
    <div className={styles.commandSuggestionPopup} style={commandSuggestionStyleForState(state)}>
      {state.suggestions.map((command, index) => (
        <div className={index === (state.activeIndex ?? 0) ? styles.commandSuggestionItemActive : styles.commandSuggestionItem} key={command.name}>
          <span className={styles.commandSuggestionName}>/{command.name}</span>
        </div>
      ))}
      {state.suggestions.length === 0 ? <div className={styles.commandSuggestionEmpty}>No matching commands</div> : null}
    </div>
  );
}

function commandSuggestionStyleForState(state: CommandSuggestionState): CSSProperties {
  const position = state.popupPosition;
  if (position) {
    return {
      bottom: position.bottom == null ? 'auto' : `${position.bottom}px`,
      left: `${position.left}px`,
      position: 'fixed',
      top: position.top == null ? 'auto' : `${position.top}px`,
    };
  }

  return {
    bottom: '180px',
    left: `calc(10% + 0.75rem + ${Math.min(Math.max(state.anchorCharacterIndex ?? 0, 0), 36)}ch)`,
    position: 'fixed',
  };
}
