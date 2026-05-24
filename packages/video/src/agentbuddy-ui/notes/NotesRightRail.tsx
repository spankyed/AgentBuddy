import './NotesRightRail.module.css';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {NoteTreeItem} from './NoteTreeItem';
import {NotesRailSection} from './NotesRailSection';
import type {NoteTreeNodeState, NotesRightRailState} from './noteTypes';
const styles = makeStyles('NotesRightRail');

type NotesRightRailProps = {
  state: NotesRightRailState;
};

export function NotesRightRail({state}: NotesRightRailProps) {
  const activeId = state.activeId ?? 'tasklist';
  const favoritesExpanded = state.favoritesExpanded ?? true;
  const searchActive = Boolean(state.search?.active);
  const searchQuery = state.search?.query?.trim() ?? '';
  const searchResults = searchQuery ? findNotes([...state.favorites, ...state.items], searchQuery) : [];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>Notes</span>
        <div className={styles.actions}>
          <button type="button"><Icons.Plus size={16} /></button>
          <button type="button"><Icons.Search size={16} /></button>
          <button type="button"><Icons.EllipsisVertical size={16} /></button>
        </div>
      </div>
      {searchActive ? (
        <div className={styles.searchPanel}>
          <div className={styles.searchBox}>
            <Icons.Search className={styles.searchIcon} size={14} />
            <input className={styles.searchInput} value={searchQuery} placeholder="Search notes..." readOnly />
            {searchQuery ? <Icons.X className={styles.clearIcon} size={14} /> : null}
          </div>
        </div>
      ) : null}
      <div className={styles.scroller}>
        {searchActive && searchQuery ? (
          <section className={styles.searchResults}>
            {searchResults.length > 0
              ? searchResults.map(item => <SearchResultItem key={item.id} item={item} />)
              : <div className={styles.emptyState}>No notes found</div>}
          </section>
        ) : (
          <>
            {state.favorites.length > 0 ? (
              <NotesRailSection expanded={favoritesExpanded} label="Favorites">
                {favoritesExpanded ? state.favorites.map(item => <NoteTreeItem key={item.id} activeId="" node={item} />) : null}
              </NotesRailSection>
            ) : null}
            <section className={styles.tree}>
              {state.items.length > 0
                ? state.items.map(item => <NoteTreeItem key={item.id} activeId={activeId} node={item} />)
                : <div className={styles.emptyState}>No notes yet</div>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SearchResultItem({item}: {item: NoteTreeNodeState}) {
  return (
    <button className={styles.searchResult} type="button">
      {item.icon ? <span className={styles.searchEmoji}>{item.icon}</span> : <SearchResultGlyph item={item} />}
      <span>{item.title || 'Untitled'}</span>
    </button>
  );
}

function SearchResultGlyph({item}: {item: NoteTreeNodeState}) {
  if (item.noteType === 'tasklist') return <Icons.ClipboardList className={styles.searchGlyph} size={14} />;
  if (item.noteType === 'task') return <Icons.CircleCheck className={styles.searchGlyph} size={14} />;
  return <Icons.Notes className={styles.searchGlyph} size={14} />;
}

function findNotes(items: NoteTreeNodeState[], query: string): NoteTreeNodeState[] {
  const normalizedQuery = query.toLowerCase();
  return items.flatMap(item => {
    const children = item.children ? findNotes(item.children, query) : [];
    return item.title.toLowerCase().includes(normalizedQuery) ? [item, ...children] : children;
  });
}
