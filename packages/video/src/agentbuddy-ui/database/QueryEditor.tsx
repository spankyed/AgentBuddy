import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseQuery} from './databaseTypes';
import './QueryEditor.module.css';

const styles = makeStyles('QueryEditor');

export function QueryEditor({query}: {query: DatabaseQuery}) {
  return (
    <section className={styles.root}>
      <div className={styles.toolbar}>
        <span>Query</span>
        <div className={styles.actions}>
          <span className={styles.status}>{query.status === 'running' ? 'Running...' : `${query.elapsedMs}ms`}</span>
          <span className={styles.run}><Icons.Play size={13} /> Run</span>
        </div>
      </div>
      <pre className={styles.code}>{highlightSql(query.sql)}</pre>
    </section>
  );
}

function highlightSql(sql: string) {
  return sql.split(/(\bSELECT\b|\bFROM\b|\bWHERE\b|\bORDER BY\b|\bLIMIT\b)/g).map((part, index) =>
    /^(SELECT|FROM|WHERE|ORDER BY|LIMIT)$/.test(part) ? <span key={index} className={styles.keyword}>{part}</span> : part,
  );
}
