import {Icons} from '../primitives/Icon';
import type {DatabaseBackupState} from './databaseTypes';
import './DatabaseBackupRestore.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('DatabaseBackupRestore');

export function DatabaseBackupRestore({state}: {state: DatabaseBackupState}) {
  const selectedCount = state.selectedDatabases.filter(database => database.selected).length;
  const isExport = state.activeTab === 'export';
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button className={styles.back} type="button"><Icons.ArrowLeft size={16} />Back to Database</button>
          <div className={styles.tabs}>
            <button className={styles.tab} data-active={isExport} type="button"><Icons.ArrowDownToLine size={16} />Export</button>
            <button className={styles.tab} data-active={!isExport} type="button"><Icons.ArrowUpFromLine size={16} />Import</button>
          </div>
          <button className={styles.action} data-tab={state.activeTab} type="button">
            {isExport ? <Icons.ArrowDownToLine size={16} /> : <Icons.ArrowUpFromLine size={16} />}
            {state.isProcessing ? (isExport ? 'Exporting...' : 'Importing...') : (isExport ? 'Export Backup' : 'Import Backup')}
          </button>
        </div>
      </header>
      <div className={styles.scroll}>
        <div className={styles.content}>
          {isExport ? (
            <div className={styles.stack}>
              <section className={styles.card}>
                <label className={styles.label}>Backup Location</label>
                <div className={styles.inputRow}>
                  <div className={styles.inputWrap}><Icons.FolderOpen className={styles.inputIcon} size={16} /><input className={styles.input} readOnly value={state.exportPath} /></div>
                  <button className={styles.browse} type="button"><Icons.FolderOpen size={16} />Browse</button>
                </div>
                <label className={styles.label} style={{marginTop: 16}}>Backup Name <span style={{color: 'rgb(82 82 82)'}}>(Optional)</span></label>
                <div className={styles.inputWrap}><Icons.FileText className={styles.inputIcon} size={16} /><input className={styles.input} readOnly value={state.backupName} /></div>
              </section>
              <DatabaseSelection count={selectedCount} databases={state.selectedDatabases} />
            </div>
          ) : (
            <div className={styles.stack}>
              <section className={styles.card}>
                <div className={styles.inputRow}>
                  <div className={styles.inputWrap}><Icons.FolderOpen className={styles.inputIcon} size={16} /><input className={styles.input} readOnly value={state.importPath ?? ''} placeholder="Backup directory to restore from" /></div>
                  <button className={styles.browse} type="button"><Icons.FolderOpen size={16} />Browse</button>
                </div>
              </section>
              <DatabaseSelection count={selectedCount} databases={state.selectedDatabases} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DatabaseSelection({count, databases}: {count: number; databases: DatabaseBackupState['selectedDatabases']}) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.title}>Databases</h3>
        <div className={styles.count}>{count} selected</div>
      </div>
      <div className={styles.grid}>
        {databases.map(database => (
          <div className={styles.dbCard} data-selected={database.selected} key={database.id}>
            <div className={styles.dbInner}>
              <span className={styles.checkbox}>{database.selected ? <Icons.Check size={16} /> : null}</span>
              <div>
                <div className={styles.dbTitle}><Icons.Database size={16} />{database.label}</div>
                <div className={styles.dbDescription}>{database.description}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
