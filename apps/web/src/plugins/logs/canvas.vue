<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Simplified Header -->
    <div class="border-b border-neutral-800">
      <!-- Search and Filters Row -->
      <div class="p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <!-- Search Input -->
            <div class="relative flex-1 max-w-md">
              <Search :size="16" class="absolute -translate-y-1/2 left-3 top-1/2 text-neutral-500" />
              <input
                :value="searchTerm"
                @input="setSearch"
                type="text"
                placeholder="Search logs..."
                class="w-full py-2 pl-10 pr-3 text-sm transition-colors border rounded-lg outline-none bg-neutral-800 placeholder-neutral-500"
                :class="searchTerm ? 'border-neutral-600 bg-neutral-800/70' : 'border-neutral-700 focus:border-neutral-600 focus:bg-neutral-800/50'"
              />
              <!-- Clear search button -->
              <button 
                v-if="searchTerm"
                @click="clearSearch"
                class="absolute p-1 transition-colors -translate-y-1/2 right-2 top-1/2 text-neutral-500 hover:text-neutral-300"
              >
                <X :size="14" />
              </button>
            </div>
            
            <!-- Level Filter Pills -->
            <div class="flex items-center gap-1 px-3 py-1 rounded-lg bg-neutral-800">
              <button
                @click="setFilterLevelDirect('all')"
                class="px-3 py-1 text-xs font-medium transition-colors rounded"
                :class="filterLevel === 'all' 
                  ? 'bg-neutral-700 text-neutral-100' 
                  : 'text-neutral-400 hover:text-neutral-200'"
              >
                All
                <span class="ml-1 text-[10px] opacity-60">
                  {{ (filterLevel !== 'all' || searchTerm) && filteredLogs.length !== logs.length 
                    ? `${filteredLogs.length}/${logs.length}` 
                    : logs.length 
                  }}
                </span>
              </button>
              
              <button
                v-if="debugCount > 0"
                @click="setFilterLevelDirect('debug')"
                class="flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors rounded"
                :class="filterLevel === 'debug' 
                  ? 'bg-neutral-700 text-neutral-100' 
                  : 'text-neutral-500 hover:text-neutral-300'"
              >
                <Bug :size="12" />
                {{ filterLevel === 'debug' && searchTerm ? filteredLogs.length : debugCount }}
              </button>
              
              <button
                v-if="infoCount > 0"
                @click="setFilterLevelDirect('info')"
                class="flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors rounded"
                :class="filterLevel === 'info' 
                  ? 'bg-blue-500/20 text-blue-400' 
                  : 'text-blue-400/60 hover:text-blue-400'"
              >
                <Info :size="12" />
                {{ filterLevel === 'info' && searchTerm ? filteredLogs.length : infoCount }}
              </button>
              
              <button
                v-if="warnCount > 0"
                @click="setFilterLevelDirect('warn')"
                class="flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors rounded"
                :class="filterLevel === 'warn' 
                  ? 'bg-yellow-500/20 text-yellow-400' 
                  : 'text-yellow-400/60 hover:text-yellow-400'"
              >
                <AlertTriangle :size="12" />
                {{ filterLevel === 'warn' && searchTerm ? filteredLogs.length : warnCount }}
              </button>
              
              <button
                v-if="errorCount > 0"
                @click="setFilterLevelDirect('error')"
                class="flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors rounded"
                :class="filterLevel === 'error' 
                  ? 'bg-red-500/20 text-red-400' 
                  : 'text-red-400/60 hover:text-red-400'"
              >
                <AlertCircle :size="12" />
                {{ filterLevel === 'error' && searchTerm ? filteredLogs.length : errorCount }}
              </button>
            </div>
          </div>
          
          <!-- Clear logs button (moved to far right) -->
          <button 
            @click="clearLogs"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:text-red-400"
            title="Clear all logs"
          >
            <Trash2 :size="12" />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- Logs Content -->
    <div ref="logsContent" class="flex-1 overflow-y-auto">
      <!-- Empty State -->
      <div v-if="filteredLogs.length === 0" class="flex items-center justify-center h-full min-h-[400px]">
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-800">
            <component 
              :is="logs.length === 0 ? Terminal : Search" 
              :size="24" 
              class="text-neutral-500"
            />
          </div>
          
          <h3 class="mb-2 text-lg font-medium text-neutral-300">
            {{ logs.length === 0 ? 'No logs yet' : 'No matching logs' }}
          </h3>
          
          <p class="max-w-sm text-sm text-neutral-500">
            {{ logs.length === 0 
              ? 'Logs from your backend will appear here.' 
              : 'Try adjusting your search or filters.' 
            }}
          </p>
          
          <div v-if="logs.length > 0" class="mt-4">
            <button 
              @click="() => { setFilterLevelDirect('all'); clearSearch(); }"
              class="px-4 py-2 text-sm font-medium transition-colors rounded-lg text-neutral-300 bg-neutral-800 hover:bg-neutral-700"
            >
              Show all logs
            </button>
          </div>
        </div>
      </div>
      
      <!-- Logs List -->
      <div v-else class="divide-y divide-neutral-800/50">
        <TransitionGroup name="log-fade">
          <div 
            v-for="log in filteredLogs" 
            :key="log.id"
            class="transition-colors group hover:bg-neutral-800/30"
          >
            <div 
              class="flex items-center gap-2 px-4 py-2.5 cursor-pointer"
              :class="hasExpandableContent(log) ? 'cursor-pointer' : ''"
              @click="cycleExpansion(log)"
            >
              <!-- Level Icon -->
              <div :class="[
                'flex-shrink-0',
                {
                  'text-neutral-500': log.level === 'debug',
                  'text-blue-400': log.level === 'info',
                  'text-yellow-400': log.level === 'warn',
                  'text-red-400': log.level === 'error'
                }
              ]">
                <component :is="getLevelIcon(log.level)" :size="14" />
              </div>
              
              <!-- Message -->
              <div class="flex-1 min-w-0">
                <p class="text-sm break-words text-neutral-200">
                  <span v-if="searchTerm" v-html="highlightSearchTerm(log.message)"></span>
                  <span v-else>{{ log.message }}</span>
                </p>
              </div>
              
              <!-- Right side metadata -->
              <div class="flex items-center flex-shrink-0 gap-3 ml-auto text-xs">
                <!-- Source Badge (if exists) -->
                <span 
                  v-if="log.source" 
                  class="px-2 py-0.5 text-[11px] font-mono bg-neutral-800 text-neutral-400 rounded"
                >
                  {{ log.source }}
                </span>
                
                <!-- Timestamp -->
                <span class="text-neutral-500 tabular-nums">
                  {{ formatTime(log.timestamp) }}
                </span>
                
                <!-- Expansion Indicator or spacer -->
                <div class="flex items-center justify-center w-4">
                  <ChevronRight 
                    v-if="hasExpandableContent(log)"
                    :size="12" 
                    class="transition-transform text-neutral-400"
                    :class="isExpanded(log.id) ? 'rotate-90' : ''"
                  />
                </div>
              </div>
            </div>
            
            <!-- Expandable Content -->
            <Transition name="expand-fade">
              <div v-if="isExpanded(log.id)" class="px-4 pb-3 border-l-2 ml-7 border-neutral-800">
                <div class="ml-4 space-y-2">
                  <!-- Meta Data -->
                  <div v-if="expandedContent.get(log.id) === 'meta' && log.meta" class="p-3 rounded-lg bg-neutral-800/50">
                    <div class="mb-1 text-xs font-medium text-neutral-400">Metadata</div>
                    <DataRenderer :data="log.meta" />
                  </div>
                  
                  <!-- Stack Trace -->
                  <div v-if="expandedContent.get(log.id) === 'stack' && log.stack" class="p-3 border rounded-lg bg-red-500/5 border-red-500/20">
                    <div class="flex items-center gap-1.5 mb-2">
                      <FileWarning :size="12" class="text-red-400" />
                      <span class="text-xs font-medium text-red-400">Stack Trace</span>
                    </div>
                    <pre class="font-mono text-xs whitespace-pre-wrap text-red-300/90">{{ formatStackTrace(log.stack) }}</pre>
                  </div>
                  
                  <!-- Content type toggles -->
                  <div v-if="getAvailableContent(log).length > 1" class="flex gap-2 mt-2">
                    <button 
                      v-if="log.meta && Object.keys(log.meta).length > 0"
                      @click.stop="toggleContent(log.id, 'meta')"
                      class="px-2 py-1 text-xs transition-colors rounded"
                      :class="expandedContent.get(log.id) === 'meta' 
                        ? 'bg-neutral-700 text-neutral-200' 
                        : 'text-neutral-400 hover:text-neutral-200'"
                    >
                      View metadata
                    </button>
                    <button 
                      v-if="log.stack"
                      @click.stop="toggleContent(log.id, 'stack')"
                      class="px-2 py-1 text-xs transition-colors rounded"
                      :class="expandedContent.get(log.id) === 'stack' 
                        ? 'bg-red-500/20 text-red-400' 
                        : 'text-neutral-400 hover:text-red-400'"
                    >
                      View stack trace
                    </button>
                  </div>
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
import { computed, ref, reactive, onMounted, nextTick } from 'vue';
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
import { applicationState } from '../../app';

const logsContent = ref<HTMLElement>();

// Scroll to bottom when component is mounted
onMounted(async () => {
  await nextTick();
  if (logsContent.value) {
    logsContent.value.scrollTo({
      top: logsContent.value.scrollHeight,
      behavior: 'smooth'
    });
  }
});

// Simple content type tracking
// To add new content types: 
// 1. Add to type union (e.g., 'perf')
// 2. Update getAvailableContent() 
// 3. Add button and content display
type ContentType = 'meta' | 'stack';
const expandedContent = reactive(new Map<string, ContentType | null>());

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
  
  // Filter by search term - simple case-insensitive substring search
  if (searchTerm.value && searchTerm.value.trim()) {
    const search = searchTerm.value.trim().toLowerCase();
    filtered = filtered.filter(log => {
      // Search in message
      if (log.message.toLowerCase().includes(search)) return true;
      // Search in source
      if (log.source && log.source.toLowerCase().includes(search)) return true;
      // Search in meta (stringified)
      if (log.meta && JSON.stringify(log.meta).toLowerCase().includes(search)) return true;
      return false;
    });
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

// Helper function to highlight search term in text
const highlightSearchTerm = (text: string): string => {
  if (!searchTerm.value || !searchTerm.value.trim()) {
    return text;
  }
  
  const search = searchTerm.value.trim();
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="text-yellow-200 bg-yellow-500/30">$1</mark>');
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
  
  // If it's yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday ' + date.toLocaleTimeString(undefined, { 
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Otherwise show date
  return date.toLocaleDateString(undefined, { 
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Simple toggle for a specific content type
const toggleContent = (logId: string, content: ContentType) => {
  const current = expandedContent.get(logId);
  expandedContent.set(logId, current === content ? null : content);
};

// Cycle through expansion states when clicking on a log row
const cycleExpansion = (log: LogEntry) => {
  // Get available content for this log
  const availableContent = getAvailableContent(log);
  
  // If no content available, do nothing
  if (availableContent.length === 0) return;
  
  // Get current state
  const current = expandedContent.get(log.id);
  
  // If only one type available, simple toggle
  if (availableContent.length === 1) {
    toggleContent(log.id, availableContent[0]);
    return;
  }
  
  // Multiple types: cycle through null -> first -> second -> ... -> null
  if (!current) {
    expandedContent.set(log.id, availableContent[0]);
  } else {
    const currentIndex = availableContent.indexOf(current);
    const nextIndex = (currentIndex + 1) % (availableContent.length + 1);
    expandedContent.set(log.id, nextIndex === availableContent.length ? null : availableContent[nextIndex]);
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

// Check if a log has any expandable content
const hasExpandableContent = (log: LogEntry) => {
  const hasMeta = log.meta && Object.keys(log.meta).length > 0;
  const hasStack = !!log.stack;
  return hasMeta || hasStack;
};

// Check if any content is expanded for a log
const isExpanded = (logId: string) => {
  return expandedContent.get(logId) !== null && expandedContent.get(logId) !== undefined;
};

// Get available content types for a log
const getAvailableContent = (log: LogEntry): ContentType[] => {
  const available: ContentType[] = [];
  if (log.stack) available.push('stack');
  if (log.meta && Object.keys(log.meta).length > 0) available.push('meta');
  return available;
};
</script>

<style scoped>
/* Vue Transitions */
.log-fade-enter-active {
  transition: all 0.2s ease;
}

.log-fade-enter-from {
  opacity: 0;
  transform: translateX(-10px);
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