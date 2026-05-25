import {makeStyles} from '../primitives/makeStyles';
import {LibraryItemList} from './LibraryItemList';
import {LibraryPreview} from './LibraryPreview';
import {LibrarySidebar} from './LibrarySidebar';
import type {LibrarySurfaceState} from './libraryTypes';
import './LibrarySurface.module.css';

const styles = makeStyles('LibrarySurface');

export function LibrarySurface({state}: {state: LibrarySurfaceState}) {
  return (
    <div className={styles.root}>
      <LibrarySidebar state={state} />
      <LibraryItemList state={state} />
      <LibraryPreview state={state} />
    </div>
  );
}
