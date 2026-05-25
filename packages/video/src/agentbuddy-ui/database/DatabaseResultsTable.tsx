import type {DatabaseQueryResult, DatabaseResultRow} from './databaseTypes';
import {JsonResultDisplay} from './JsonResultDisplay';
import {PrimitiveResultDisplay} from './PrimitiveResultDisplay';
import {PrimitiveResultsTable} from './PrimitiveResultsTable';
import {ResultStates} from './ResultStates';
import {ResultsInfoBar} from './ResultsInfoBar';
import {makeStyles} from '../primitives/makeStyles';
import './DatabaseResultsTable.module.css';

const styles = makeStyles('DatabaseResultsTable');

type DatabaseResultsTableProps = {
  error: string | null;
  executionTime: number | null;
  isLoading: boolean;
  result: DatabaseQueryResult;
};

export function DatabaseResultsTable({error, executionTime, isLoading, result}: DatabaseResultsTableProps) {
  const analysis = analyzeResult(result);
  const currentState = getState({analysis, error, isLoading, result});
  return (
    <div className={styles.root}>
      <div className={styles.tableContainer}>
        {currentState !== 'data' ? (
          <ResultStates error={error} state={currentState} />
        ) : analysis.resultType === 'array' && analysis.isArrayOfPrimitives ? (
          <PrimitiveResultsTable values={result as unknown[]} />
        ) : analysis.resultType === 'array' ? (
          <ObjectResultsTable headers={analysis.headers} rows={analysis.tableData} />
        ) : analysis.resultType === 'object' ? (
          <JsonResultDisplay data={result} />
        ) : (
          <PrimitiveResultDisplay value={result} />
        )}
      </div>
      <ResultsInfoBar
        executionTime={executionTime}
        hasResult={result !== null}
        isArrayOfPrimitives={analysis.isArrayOfPrimitives}
        resultCount={analysis.resultCount}
        resultType={analysis.resultType ?? 'primitive'}
      />
    </div>
  );
}

function ObjectResultsTable({headers, rows}: {headers: string[]; rows: DatabaseResultRow[]}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map(header => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map(header => (
                <td key={header}>
                  <div title={formatCellValue(row[header])}>{formatCellValue(row[header])}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getState({
  analysis,
  error,
  isLoading,
  result,
}: Pick<DatabaseResultsTableProps, 'error' | 'isLoading' | 'result'> & {analysis: ResultAnalysis}): 'data' | 'empty-array' | 'error' | 'loading' | 'no-results' {
  if (isLoading) return 'loading';
  if (error) return 'error';
  if (result === null) return 'no-results';
  if (analysis.resultType === 'array' && analysis.resultCount === 0) return 'empty-array';
  return 'data';
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function collectHeaders(rows: DatabaseResultRow[]) {
  const headers = new Set<string>();
  rows.forEach(row => {
    Object.keys(row).forEach(key => headers.add(key));
  });
  return Array.from(headers);
}

type ResultAnalysis = {
  headers: string[];
  isArrayOfPrimitives: boolean;
  resultCount: number;
  resultType: 'array' | 'object' | 'primitive' | null;
  tableData: DatabaseResultRow[];
};

function analyzeResult(result: DatabaseQueryResult): ResultAnalysis {
  if (result === null) {
    return {headers: [], isArrayOfPrimitives: false, resultCount: 0, resultType: null, tableData: []};
  }

  if (!Array.isArray(result)) {
    return {
      headers: [],
      isArrayOfPrimitives: false,
      resultCount: 0,
      resultType: typeof result === 'object' ? 'object' : 'primitive',
      tableData: [],
    };
  }

  const isArrayOfPrimitives = result.length > 0 && (typeof result[0] !== 'object' || result[0] === null);
  const tableData = isArrayOfPrimitives ? [] : result.map(item => (typeof item === 'object' && item !== null ? item as DatabaseResultRow : {}));
  const headers = tableData.length > 0 ? collectHeaders(tableData) : [];
  return {
    headers,
    isArrayOfPrimitives,
    resultCount: result.length,
    resultType: 'array',
    tableData,
  };
}
