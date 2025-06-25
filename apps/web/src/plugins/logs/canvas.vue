<template>
  <div class="flex flex-col min-h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between flex-shrink-0 px-3 py-2 border-b backdrop-blur-sm bg-neutral-800/95 border-neutral-700">
      <div class="flex items-center gap-3">
        <!-- Level Filter -->
        <div class="relative">
          <select 
            :value="filterLevel" 
            @change="setFilterLevel"
            class="px-3 py-1 pr-8 text-sm font-medium transition-colors rounded outline-none appearance-none cursor-pointer bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <ChevronDown :size="12" class="absolute -translate-y-1/2 pointer-events-none right-2 top-1/2 text-neutral-400" />
        </div>
        
        <!-- Search -->
        <div class="relative">
          <Search :size="12" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            :value="searchTerm"
            @input="setSearch"
            type="text"
            placeholder="Search logs..."
            class="w-56 py-1 pl-8 pr-3 text-sm transition-all rounded outline-none bg-neutral-700 hover:bg-neutral-600 text-neutral-200 placeholder-neutral-500 focus:bg-neutral-600 focus:ring-1 focus:ring-neutral-500"
          />
        </div>
      </div>
      
      <div class="flex items-center gap-4">
        <!-- Log Level Counts with improved UI -->
        <div class="flex items-center gap-2">
          <!-- Total Count (de-emphasized) -->
          <div class="flex gap-1.5 items-center px-2 text-xs text-neutral-500">
            <span>{{ logs.length }}</span>
            <span>logs</span>
          </div>
          
          <!-- Divider -->
          <div class="w-px h-4 bg-neutral-700"></div>
          
          <!-- Log Level Filters -->
          <div class="flex items-center gap-1">
            <!-- Debug -->
            <button
              v-if="debugCount > 0"
              @click="setFilterLevelDirect('debug')"
              class="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-all rounded group"
              :class="filterLevel === 'debug' 
                ? 'bg-neutral-700 text-neutral-200' 
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'"
              title="Show only debug logs"
            >
              <Bug :size="12" />
              <span>{{ debugCount }}</span>
            </button>
            
            <!-- Info -->
            <button
              v-if="infoCount > 0"
              @click="setFilterLevelDirect('info')"
              class="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-all rounded group"
              :class="filterLevel === 'info' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-blue-400/70 hover:bg-blue-500/10 hover:text-blue-400'"
              title="Show only info logs"
            >
              <Info :size="12" />
              <span>{{ infoCount }}</span>
            </button>
            
            <!-- Warning -->
            <button
              v-if="warnCount > 0"
              @click="setFilterLevelDirect('warn')"
              class="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-all rounded group"
              :class="filterLevel === 'warn' 
                ? 'bg-yellow-500/20 text-yellow-400' 
                : 'text-yellow-400/70 hover:bg-yellow-500/10 hover:text-yellow-400'"
              title="Show only warning logs"
            >
              <AlertTriangle :size="12" />
              <span>{{ warnCount }}</span>
            </button>
            
            <!-- Error -->
            <button
              v-if="errorCount > 0"
              @click="setFilterLevelDirect('error')"
              class="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-all rounded group"
              :class="filterLevel === 'error' 
                ? 'bg-red-500/20 text-red-400' 
                : 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'"
              title="Show only error logs"
            >
              <AlertCircle :size="12" />
              <span>{{ errorCount }}</span>
            </button>
          </div>
        </div>
        
        <!-- Actions -->
        <div class="flex items-center gap-2">
          <!-- Clear Filters (only show when filters are active) -->
          <button 
            v-if="filterLevel !== 'all' || searchTerm"
            @click="() => { setFilterLevelDirect('all'); clearSearch(); }"
            class="px-2 py-1 text-xs font-medium transition-colors text-neutral-400 hover:text-neutral-200"
            title="Clear all filters"
          >
            <X :size="14" />
          </button>
          
          <!-- Clear Logs Button with better styling -->
          <button 
            @click="clearLogs"
            class="flex gap-1.5 items-center px-3 py-1 text-xs font-medium rounded border transition-all text-neutral-400 bg-neutral-800 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 border-neutral-700"
            title="Clear all logs"
          >
            <Trash2 :size="12" />
            <span>Clear logs</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- Logs Content -->
    <div ref="logsContent" class="flex-1 min-h-0 bg-neutral-900">
      <!-- Empty State -->
      <div v-if="filteredLogs.length === 0" class="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <div class="p-8 border rounded-lg bg-neutral-800/30 border-neutral-700/50">
          <div class="relative p-4 mx-auto mb-4 rounded-full bg-neutral-800/50 w-fit">
            <component 
              :is="logs.length === 0 ? Terminal : Search" 
              :size="32" 
              class="text-neutral-500"
            />
            <div v-if="logs.length === 0" class="absolute w-3 h-3 bg-green-500 rounded-full top-1 right-1 animate-pulse"></div>
          </div>
          
          <h3 class="mb-2 text-lg font-semibold text-neutral-300">
            {{ logs.length === 0 ? 'No logs recorded yet' : 'No logs match your filters' }}
          </h3>
          
          <p class="max-w-sm mx-auto mb-6 text-sm text-neutral-500">
            {{ logs.length === 0 
              ? 'Backend logs will appear here in real-time as they are generated by the application.' 
              : `Try adjusting your filters or search for different keywords. ${logs.length} logs are currently hidden.` 
            }}
          </p>
          
          <div v-if="logs.length === 0" class="flex flex-col gap-3 text-xs text-neutral-500">
            <div class="p-3 font-mono text-left border rounded bg-neutral-800/50 border-neutral-700/50">
              <span class="text-neutral-600">// Example usage in backend:</span><br>
              <span class="text-blue-400">import</span> { log } <span class="text-blue-400">from</span> <span class="text-green-400">'@/systems/logs/logger'</span>;<br><br>
              <span class="text-neutral-400">log</span>.<span class="text-blue-400">info</span>(<span class="text-green-400">'Server started'</span>);<br>
              <span class="text-neutral-400">log</span>.<span class="text-yellow-400">warn</span>(<span class="text-green-400">'High memory usage'</span>, { <span class="text-neutral-400">usage</span>: <span class="text-orange-400">'85%'</span> });
            </div>
          </div>
          
          <div v-else class="flex justify-center gap-2">
            <button 
              @click="() => { setFilterLevelDirect('all'); clearSearch(); }"
              class="px-3 py-1.5 text-xs font-medium rounded transition-colors bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
            >
              Clear all filters
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="filteredLogs.length > 0" class="px-3 py-2 space-y-0.5">
        <TransitionGroup name="log-fade">
          <div 
            v-for="log in filteredLogs" 
            :key="log.id"
            class="group"
          >
            <div class="flex gap-2 items-center px-3 py-1.5 rounded transition-colors hover:bg-neutral-800/50">
              <!-- Timestamp -->
              <span class="flex-shrink-0 w-24 text-sm text-neutral-500">
                {{ formatTime(log.timestamp) }}
              </span>
              
              <!-- Level Badge -->
              <div :class="[
                'flex items-center justify-center w-12 h-5 rounded text-sm font-semibold flex-shrink-0',
                {
                  'bg-neutral-700/50 text-neutral-400': log.level === 'debug',
                  'bg-blue-500/20 text-blue-400': log.level === 'info',
                  'bg-yellow-500/20 text-yellow-400': log.level === 'warn',
                  'bg-red-500/20 text-red-400': log.level === 'error'
                }
              ]">
                <component :is="getLevelIcon(log.level)" :size="12" />
              </div>
              
              <!-- Source Badge -->
              <span 
                v-if="log.source" 
                class="px-2 h-5 flex items-center bg-neutral-800 text-neutral-400 text-sm font-mono rounded flex-shrink-0 min-w-[72px] justify-center"
              >
                {{ log.source }}
              </span>
              <span v-else class="w-[72px] flex-shrink-0"></span>
              
              <!-- Message -->
              <p class="flex-1 text-[13px] text-neutral-200 leading-5 truncate">{{ log.message }}</p>
              
              <!-- Action Icons -->
              <div class="flex flex-shrink-0 gap-0.5 items-center mr-1">
                <button 
                  v-if="log.meta && Object.keys(log.meta).length > 0"
                  @click="toggleMeta(log.id)"
                  :class="[
                    'p-1 rounded transition-all',
                    expandedMeta.has(log.id) 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700'
                  ]"
                  title="View metadata"
                >
                  <Code2 :size="14" />
                </button>
                
                <button 
                  v-if="log.stack"
                  @click="toggleStack(log.id)"
                  :class="[
                    'p-1 rounded transition-all',
                    expandedStacks.has(log.id)
                      ? 'bg-red-500/20 text-red-400'
                      : 'text-neutral-500 hover:text-red-400 hover:bg-red-500/10'
                  ]"
                  title="View stack trace"
                >
                  <FileWarning :size="14" />
                </button>
              </div>
            </div>
            
            <!-- Expandable Content -->
            <Transition name="expand-fade">
              <div v-if="expandedMeta.has(log.id) || expandedStacks.has(log.id)" class="border-l-2 border-neutral-800 ml-[27px] mb-1">
                <div v-if="expandedMeta.has(log.id)" class="p-2.5 mr-3 ml-4 rounded-md bg-neutral-800/30">
                  <div class="flex gap-1.5 items-center mb-1.5">
                    <Code2 :size="12" class="text-blue-400" />
                    <span class="text-sm font-medium text-blue-400">Metadata</span>
                  </div>
                  <DataRenderer :data="log.meta" />
                </div>
                
                <div v-if="expandedStacks.has(log.id)" class="p-2.5 mt-1 mr-3 ml-4 rounded-md border bg-red-500/5 border-red-500/10">
                  <div class="flex gap-1.5 items-center mb-1.5">
                    <FileWarning :size="12" class="text-red-400" />
                    <span class="text-sm font-medium text-red-400">Stack Trace</span>
                  </div>
                  <pre class="font-mono text-sm leading-4 whitespace-pre-wrap text-red-400/90">{{ formatStackTrace(log.stack) }}</pre>
                </div>
              </div>
            </Transition>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue';
import { 
  Search, 
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  FileX,
  Code2,
  FileWarning,
  Terminal,
  X,
  Trash2
} from 'lucide-vue-next';
import { id } from './state';
import type { LogsState, LogEntry } from './state';
import { useSelector } from '@xstate/vue';
import DataRenderer from './data-renderer.vue';
import { applicationState } from '@/app'

const logsContent = ref<HTMLElement>();
const expandedMeta = reactive(new Set<string>());
const expandedStacks = reactive(new Set<string>());

const actor: LogsState = applicationState.system.get(id)
const logs = useSelector(actor, (s) => (s as any).context.logs);
const filterLevel = useSelector(actor, (s) => (s as any).context.filter.level);
const searchTerm = useSelector(actor, (s) => (s as any).context.filter.search);

const filteredLogs = computed(() => {
  let filtered = logs.value;
  
  // Filter by level
  if (filterLevel.value !== 'all') {
    filtered = filtered.filter(log => log.level === filterLevel.value);
  }
  
  // Filter by search term
  if (searchTerm.value) {
    const search = searchTerm.value.toLowerCase();
    filtered = filtered.filter(log => 
      log.message.toLowerCase().includes(search) ||
      log.source?.toLowerCase().includes(search) ||
      JSON.stringify(log.meta).toLowerCase().includes(search)
    );
  }
  
  return filtered;
});

const errorCount = computed(() => logs.value.filter(log => log.level === 'error').length);
const warnCount = computed(() => logs.value.filter(log => log.level === 'warn').length);
const infoCount = computed(() => logs.value.filter(log => log.level === 'info').length);
const debugCount = computed(() => logs.value.filter(log => log.level === 'debug').length);

const setFilterLevel = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  actor.send({ type: 'SET_FILTER_LEVEL', level: target.value as any });
};

const setFilterLevelDirect = (level: 'all' | 'debug' | 'info' | 'warn' | 'error') => {
  actor.send({ type: 'SET_FILTER_LEVEL', level });
};

const setSearch = (e: Event) => {
  const target = e.target as HTMLInputElement;
  actor.send({ type: 'SET_SEARCH', search: target.value });
};

const clearSearch = () => {
  actor.send({ type: 'SET_SEARCH', search: '' });
};

const clearLogs = () => {
  actor.send({ type: 'CLEAR_LOGS' });
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  
  // If it's today, just show time
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  // If it's within the last week, show day and time
  const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return date.toLocaleDateString(undefined, { 
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Otherwise show date and time
  return date.toLocaleDateString(undefined, { 
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const toggleMeta = (logId: string) => {
  if (expandedMeta.has(logId)) {
    expandedMeta.delete(logId);
  } else {
    expandedMeta.add(logId);
  }
};

const toggleStack = (logId: string) => {
  if (expandedStacks.has(logId)) {
    expandedStacks.delete(logId);
  } else {
    expandedStacks.add(logId);
  }
};

const formatStackTrace = (stack: string) => {
  // Clean up and format stack traces for better readability
  return stack
    .split('\n')
    .map(line => line.trim())
    .filter(line => line)
    .join('\n');
};

const getLevelIcon = (level: string) => {
  const icons = {
    debug: Bug,
    info: Info,
    warn: AlertTriangle,
    error: AlertCircle
  };
  return icons[level as keyof typeof icons] || Info;
};
</script>

<style scoped>
/* Vue Transitions */
.log-fade-enter-active {
  transition: all 0.2s ease;
}

.log-fade-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.expand-fade-enter-active,
.expand-fade-leave-active {
  transition: all 0.15s ease;
}

.expand-fade-enter-from,
.expand-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style> 