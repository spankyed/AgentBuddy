import type {CSSProperties} from 'react';
import {ReferenceIcon} from './ReferencePill';
import {referenceCategoryLabel} from './referenceConfig';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type ReferenceAutocompleteState = NonNullable<ChatComposerState['referenceAutocomplete']>;

// Mirrors packages/renderer/src/core/components/tiptap/ReferenceSuggestionPopup.vue.
export function ReferenceAutocomplete({state}: {state: ReferenceAutocompleteState}) {
  const activeCategoryLabel = referenceCategoryLabel(state.selectedCategory);
  if (state.level === 'items') {
    return (
      <div className={styles.referenceAutocomplete} style={referenceAutocompleteStyle(state.anchorCharacterIndex)}>
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
    );
  }

  return (
    <div className={styles.referenceAutocomplete} style={referenceAutocompleteStyle(state.anchorCharacterIndex)}>
      {state.suggestions.map((suggestion, index) => (
        <div className={isActiveReferenceSuggestion(state.activeId, suggestion.id, index) ? styles.referenceSuggestionActive : styles.referenceSuggestion} key={suggestion.id}>
          <ReferenceIcon tone="suggestion" refType={suggestion.id} />
          <span className={styles.referenceSuggestionLabel}>{suggestion.label}</span>
        </div>
      ))}
      {state.suggestions.length === 0 ? <div className={styles.referenceSuggestionEmpty}>No matching categories</div> : null}
    </div>
  );
}

function referenceAutocompleteStyle(anchorCharacterIndex: number): CSSProperties {
  return {
    '--reference-anchor-x': `calc(0.75rem + ${Math.min(Math.max(anchorCharacterIndex, 0), 36)}ch)`,
  } as CSSProperties;
}

function isActiveReferenceSuggestion(activeId: string | undefined, suggestionId: string, index: number) {
  return activeId ? suggestionId === activeId : index === 0;
}

function shortReferenceCode(shortCode: string) {
  return shortCode.length > 12 ? `${shortCode.slice(0, 12)}…` : shortCode;
}
