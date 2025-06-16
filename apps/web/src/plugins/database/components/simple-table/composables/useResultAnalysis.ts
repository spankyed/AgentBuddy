import { computed, type ComputedRef, type Ref } from 'vue';

export type ResultType = 'array' | 'object' | 'primitive' | null;

export interface ResultAnalysis {
  resultType: ComputedRef<ResultType>;
  isArrayOfPrimitives: ComputedRef<boolean>;
  resultCount: ComputedRef<number>;
  tableHeaders: ComputedRef<string[]>;
  tableData: ComputedRef<Record<string, any>[]>;
}

export function useResultAnalysis(queryResult: Ref<any>): ResultAnalysis {
  const resultType = computed<ResultType>(() => {
    if (!queryResult.value) return null;
    if (Array.isArray(queryResult.value)) return 'array';
    if (typeof queryResult.value === 'object') return 'object';
    return 'primitive';
  });

  const isArrayOfPrimitives = computed(() => {
    if (!Array.isArray(queryResult.value) || queryResult.value.length === 0) {
      return false;
    }
    const firstElement = queryResult.value[0];
    return typeof firstElement !== 'object' || firstElement === null;
  });

  const resultCount = computed(() => {
    if (Array.isArray(queryResult.value)) {
      return queryResult.value.length;
    }
    return 0;
  });

  const tableHeaders = computed(() => {
    if (!Array.isArray(queryResult.value) || queryResult.value.length === 0 || isArrayOfPrimitives.value) {
      return [];
    }
    
    const allKeys = new Set<string>();
    queryResult.value.forEach((item: any) => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach(key => allKeys.add(key));
      }
    });
    
    return Array.from(allKeys).sort((a, b) => {
      if (a === 'id') return -1;
      if (b === 'id') return 1;
      return a.localeCompare(b);
    });
  });

  const tableData = computed(() => {
    if (!Array.isArray(queryResult.value) || isArrayOfPrimitives.value) return [];
    
    return queryResult.value.map((item: any) => {
      const row: Record<string, any> = {};
      tableHeaders.value.forEach(header => {
        row[header] = item?.[header] ?? null;
      });
      return row;
    });
  });

  return {
    resultType,
    isArrayOfPrimitives,
    resultCount,
    tableHeaders,
    tableData,
  };
} 