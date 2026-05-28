import type {CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {ReferenceIcon} from './ReferencePill';
import {referenceCategoryLabel} from './referenceConfig';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type ReferenceAutocompleteState = NonNullable<ChatComposerState['referenceAutocomplete']>;

/*
 * Mirrors packages/renderer/src/core/components/tiptap/ReferenceSuggestionPopup.vue.
 * Positioned popups are portaled to body, like Vue's Teleport, so fixed
 * coordinates are not captured by transformed film wrappers.
 */
export function ReferenceAutocomplete({state}: {state: ReferenceAutocompleteState}) {
  const activeCategoryLabel = referenceCategoryLabel(state.selectedCategory);
  const popup = state.level === 'items' ? (
    <div className={styles.referenceAutocomplete} style={referenceAutocompleteStyleForState(state)}>
      <div className={styles.referenceSuggestionHeader}>
        <span className={styles.referenceSuggestionBack}>←</span>
        <span>{activeCategoryLabel}</span>
      </div>
      {state.suggestions.map((suggestion, index) => (
        <div className={isActiveReferenceSuggestion(state.activeId, suggestion.id, index) ? styles.referenceSuggestionActive : styles.referenceSuggestion} key={suggestion.id}>
          <ReferenceIcon tone="suggestion" refType={suggestion.type} />
          <span className={styles.referenceSuggestionLabel}>{suggestion.label}</span>
          <span className={styles.referenceSuggestionCode} title={suggestion.shortCode}>{shortReferenceCode(suggestion.shortCode)}</span>
        </div>
      ))}
      {state.suggestions.length === 0 ? <div className={styles.referenceSuggestionEmpty}>No matching items</div> : null}
    </div>
  ) : (
    <div className={styles.referenceAutocomplete} style={referenceAutocompleteStyleForState(state)}>
      {state.suggestions.map((suggestion, index) => (
        <div className={isActiveReferenceSuggestion(state.activeId, suggestion.id, index) ? styles.referenceSuggestionActive : styles.referenceSuggestion} key={suggestion.id}>
          <ReferenceIcon tone="suggestion" refType={suggestion.id} />
          <span>{suggestion.label}</span>
        </div>
      ))}
      {state.suggestions.length === 0 ? <div className={styles.referenceSuggestionEmpty}>No matching categories</div> : null}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(popup, document.body);
  }

  return popup;
}

function referenceAutocompleteStyleForState(state: ReferenceAutocompleteState): CSSProperties {
  const position = state.popupPosition;
  if (!position) {
    return {
      bottom: '0px',
      left: `${state.anchorCharacterIndex}px`,
      position: 'fixed',
    };
  }

  const isFullEditor = state.variant === 'full';
  return {
    bottom: position.bottom == null || isFullEditor && position.top != null ? 'auto' : `${position.bottom}px`,
    left: `${position.left}px`,
    position: 'fixed',
    top: position.top == null ? 'auto' : `${position.top}px`,
  };
}

function isActiveReferenceSuggestion(activeId: string | undefined, suggestionId: string, index: number) {
  return activeId ? suggestionId === activeId : index === 0;
}

function shortReferenceCode(shortCode: string) {
  return shortCode.length > 12 ? `${shortCode.slice(0, 12)}…` : shortCode;
}
