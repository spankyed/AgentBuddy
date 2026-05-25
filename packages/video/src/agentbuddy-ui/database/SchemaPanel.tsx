import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSchemaCategory, DatabaseSurfaceState} from './databaseTypes';
import './SchemaPanel.module.css';

const styles = makeStyles('SchemaPanel');

export function SchemaPanel({state}: {state: DatabaseSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>
        <div className={styles.searchRow}>
          <div className={styles.searchBox}>
            <Icons.Search className={styles.searchIcon} />
            <div className={styles.searchInput}>{state.searchQuery || 'Search schema...'}</div>
          </div>
          <div className={styles.refresh} title="Refresh schema">
            <Icons.RefreshCw size={16} />
          </div>
        </div>
      </header>
      <div className={styles.tree}>
        {state.schema.map(category => (
          <div key={category.id} className={styles.category}>
            <CategoryHeader category={category} />
            {category.expanded ? (
              <div className={styles.children}>
                {category.items.map(item => (
                  <div key={item.id} className={`${styles.child} ${item.selected ? styles.childActive : ''}`}>
                    <ItemIcon category={category.id} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <footer className={styles.footer}>
        <div className={styles.collapseButton}>
          <Icons.FoldVertical size={16} style={{marginRight: 8}} />
          Collapse All
        </div>
      </footer>
    </aside>
  );
}

function CategoryHeader({category}: {category: DatabaseSchemaCategory}) {
  return (
    <div className={styles.categoryHeader}>
      <Icons.ChevronRight className={styles.chevron} style={{transform: category.expanded ? 'rotate(90deg)' : undefined}} />
      <CategoryIcon category={category.id} color={category.color} />
      <span className={styles.categoryLabel}>{category.label}</span>
      <span className={styles.count}>{category.count}</span>
    </div>
  );
}

function CategoryIcon({category, color}: {category: DatabaseSchemaCategory['id']; color: DatabaseSchemaCategory['color']}) {
  const className = `${styles.categoryIcon} ${styles[color]}`;
  if (category === 'entities') return <Icons.Database className={className} />;
  if (category === 'attributes') return <Icons.Tag className={className} />;
  return <Icons.Link className={className} />;
}

function ItemIcon({category}: {category: DatabaseSchemaCategory['id']}) {
  if (category === 'attributes') return <Icons.Hash className={styles.childIcon} />;
  if (category === 'relations') return <Icons.Network className={styles.childIcon} />;
  return <Icons.Box className={styles.childIcon} />;
}
