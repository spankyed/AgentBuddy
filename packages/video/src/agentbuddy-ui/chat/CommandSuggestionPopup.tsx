import type {CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type CommandSuggestionState = NonNullable<ChatComposerState['commandSuggestion']>;

/*
 * Mirrors packages/renderer/src/core/components/tiptap/CommandSuggestionPopup.vue.
 * Positioned popups are portaled to body, like Vue's Teleport, so fixed
 * coordinates are not captured by transformed film wrappers.
 */
export function CommandSuggestionPopup({state}: {state: CommandSuggestionState}) {
  const popup = (
    <div className={styles.commandSuggestionPopup} style={commandSuggestionStyleForState(state)}>
      {state.suggestions.map((command, index) => (
        <div className={index === (state.activeIndex ?? 0) ? styles.commandSuggestionItemActive : styles.commandSuggestionItem} key={command.name}>
          <span className={styles.commandSuggestionName}>/{command.name}</span>
        </div>
      ))}
      {state.suggestions.length === 0 ? <div className={styles.commandSuggestionEmpty}>No matching commands</div> : null}
    </div>
  );

  if (state.popupPosition && typeof document !== 'undefined') {
    return createPortal(popup, document.body);
  }

  return popup;
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
    bottom: 'calc(100% + 4px)',
    left: `calc(1rem + ${Math.min(Math.max(state.anchorCharacterIndex ?? 0, 0), 36)}ch)`,
    position: 'absolute',
  };
}
