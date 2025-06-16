<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Results Info Bar -->
    <ResultsInfoBar
      :query-result="queryResult"
      :result-type="resultType"
      :result-count="resultCount"
      :is-array-of-primitives="isArrayOfPrimitives"
    />

    <!-- Table Container -->
    <div class="flex-1 overflow-auto">
      <!-- State displays -->
      <ResultStates 
        v-if="currentState !== 'data'"
        :state="currentState"
        :error="error"
      />

      <!-- Data displays -->
      <template v-else>
        <!-- Array of Primitives -->
        <PrimitivesTable 
          v-if="isArrayOfPrimitives && resultCount > 0"
          :values="queryResult"
        />

        <!-- Array of Objects -->
        <ObjectsTable
          v-else-if="resultType === 'array' && !isArrayOfPrimitives && resultCount > 0"
          :headers="tableHeaders"
          :rows="tableData"
        />

        <!-- Single Object -->
        <JsonDisplay
          v-else-if="resultType === 'object'"
          :data="queryResult"
        />

        <!-- Primitive Value -->
        <PrimitiveDisplay
          v-else
          :value="queryResult"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { id } from '../../state';
import { applicationState } from '@/app';
import { useResultAnalysis } from './composables/useResultAnalysis';
import ResultsInfoBar from './components/ResultsInfoBar.vue';
import ResultStates from './components/ResultStates.vue';
import PrimitivesTable from './components/PrimitivesTable.vue';
import ObjectsTable from './components/ObjectsTable.vue';
import JsonDisplay from './components/JsonDisplay.vue';
import PrimitiveDisplay from './components/PrimitiveDisplay.vue';

// State Management
const actor = applicationState.system.get(id);
const queryResult = useSelector(actor, (state: any) => state.context.queryResult);
const isLoading = useSelector(actor, (state: any) => state.context.isLoading);
const error = useSelector(actor, (state: any) => state.context.error);

// Result Analysis
const { 
  resultType, 
  isArrayOfPrimitives, 
  resultCount, 
  tableHeaders, 
  tableData 
} = useResultAnalysis(queryResult);

// Computed Properties
const currentState = computed(() => {
  if (isLoading.value) return 'loading';
  if (error.value) return 'error';
  if (!queryResult.value) return 'no-results';
  if (resultType.value === 'array' && resultCount.value === 0) return 'empty-array';
  return 'data';
});
</script> 