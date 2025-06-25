<template>
  <div class="flex flex-col min-h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex flex-shrink-0 justify-between items-center px-3 py-2 border-b backdrop-blur-sm bg-neutral-800/95 border-neutral-700">
      <div class="flex gap-3 items-center">
        <!-- Level Filter -->
        <div class="relative">
          <select 
            :value="filterLevel" 
            @change="setFilterLevel"
            class="px-3 py-1 pr-8 text-sm font-medium rounded transition-colors appearance-none cursor-pointer outline-none bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <ChevronDown :size="12" class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400" />
        </div>
        
        <!-- Search -->
        <div class="relative">
          <Search :size="12" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            :value="searchTerm"
            @input="setSearch"
            type="text"
            placeholder="Search logs..."
            class="py-1 pr-3 pl-8 w-56 text-sm rounded transition-all outline-none bg-neutral-700 hover:bg-neutral-600 text-neutral-200 placeholder-neutral-500 focus:bg-neutral-600 focus:ring-1 focus:ring-neutral-500"
          />
        </div>
      </div>
      
      <div class="flex gap-4 items-center">
        <!-- Log Level Counts with improved UI -->
        <div class="flex gap-2 items-center">
          <!-- Total Count (de-emphasized) -->
          <div class="flex gap-1.5 items-center px-2 text-xs text-neutral-500">
            <span>{{ logs.length }}</span>
            <span>logs</span>
          </div>
          
          <!-- Divider -->
          <div class="w-px h-4 bg-neutral-700"></div>
          
          <!-- Log Level Filters -->
          <div class="flex gap-1 items-center">
            <!-- Debug -->
            <button
              v-if="debugCount > 0"
              @click="setFilterLevelDirect('debug')"
              class="flex gap-1 items-center px-2 py-1 text-xs font-medium rounded transition-all group"
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
              class="flex gap-1 items-center px-2 py-1 text-xs font-medium rounded transition-all group"
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
              class="flex gap-1 items-center px-2 py-1 text-xs font-medium rounded transition-all group"
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
              class="flex gap-1 items-center px-2 py-1 text-xs font-medium rounded transition-all group"
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
        <div class="flex gap-2 items-center">
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
        <div class="p-8 rounded-lg border bg-neutral-800/30 border-neutral-700/50">
          <div class="relative p-4 mx-auto mb-4 rounded-full bg-neutral-800/50 w-fit">
            <component 
              :is="logs.length === 0 ? Terminal : Search" 
              :size="32" 
              class="text-neutral-500"
            />
            <div v-if="logs.length === 0" class="absolute top-1 right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          
          <h3 class="mb-2 text-lg font-semibold text-neutral-300">
            {{ logs.length === 0 ? 'No logs recorded yet' : 'No logs match your filters' }}
          </h3>
          
          <p class="mx-auto mb-6 max-w-sm text-sm text-neutral-500">
            {{ logs.length === 0 
              ? 'Backend logs will appear here in real-time as they are generated by the application.' 
              : `Try adjusting your filters or search for different keywords. ${logs.length} logs are currently hidden.` 
            }}
          </p>
          
          <div v-if="logs.length === 0" class="flex flex-col gap-3 text-xs text-neutral-500">
            <div class="p-3 font-mono text-left rounded border bg-neutral-800/50 border-neutral-700/50">
              <span class="text-neutral-600">// Example usage in backend:</span><br>
              <span class="text-blue-400">import</span> { log } <span class="text-blue-400">from</span> <span class="text-green-400">'@/systems/logs/logger'</span>;<br><br>
              <span class="text-neutral-400">log</span>.<span class="text-blue-400">info</span>(<span class="text-green-400">'Server started'</span>);<br>
              <span class="text-neutral-400">log</span>.<span class="text-yellow-400">warn</span>(<span class="text-green-400">'High memory usage'</span>, { <span class="text-neutral-400">usage</span>: <span class="text-orange-400">'85%'</span> });
            </div>
          </div>
          
          <div v-else class="flex gap-2 justify-center">
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
            <div 
              class="flex gap-2 items-center px-3 py-1.5 rounded transition-colors hover:bg-neutral-800/50"
              :class="hasExpandableContent(log) ? 'cursor-pointer' : ''"
              @click="cycleExpansion(log)"
            >
              <!-- Expansion Indicator -->
              <div class="flex-shrink-0 w-4">
                <ChevronRight 
                  v-if="hasExpandableContent(log)"
                  :size="12" 
                  class="transition-transform text-neutral-500"
                  :class="isExpanded(log.id) ? 'rotate-90' : ''"
                />
              </div>
              
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
              <p class="flex-1 text-[13px] text-neutral-200 leading-5 truncate">
                <span v-if="searchTerm" v-html="highlightSearchTerm(log.message)"></span>
                <span v-else>{{ log.message }}</span>
              </p>
              
              <!-- Action Icons -->
              <div class="flex flex-shrink-0 gap-0.5 items-center mr-1">
                <button 
                  v-if="log.meta && Object.keys(log.meta).length > 0"
                  @click.stop="toggleContent(log.id, 'meta')"
                  :class="[
                    'p-1 rounded transition-all',
                    expandedContent.get(log.id) === 'meta'
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700'
                  ]"
                  title="View metadata"
                >
                  <Code2 :size="14" />
                </button>
                
                <button 
                  v-if="log.stack"
                  @click.stop="toggleContent(log.id, 'stack')"
                  :class="[
                    'p-1 rounded transition-all',
                    expandedContent.get(log.id) === 'stack'
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
              <div v-if="isExpanded(log.id)" class="mb-1 ml-[43px] border-l-2 border-neutral-800">
                <div v-if="expandedContent.get(log.id) === 'meta'" class="p-2.5 mr-3 ml-4 rounded-md bg-neutral-800/30">
                  <DataRenderer :data="log.meta" />
                </div>
                
                <div v-if="expandedContent.get(log.id) === 'stack'" class="p-2.5 mt-1 mr-3 ml-4 rounded-md border bg-red-500/5 border-red-500/10">
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
import { applicationState } from '../../app';

const logsContent = ref<HTMLElement>();

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

// Simple fuzzy match function - checks if all search characters appear in order
const fuzzyMatch = (text: string, search: string): boolean => {
  const textLower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  
  // First try exact substring match
  if (textLower.includes(searchLower)) {
    return true;
  }
  
  // Then try fuzzy match - all characters must appear in order
  let searchIndex = 0;
  for (let i = 0; i < textLower.length && searchIndex < searchLower.length; i++) {
    if (textLower[i] === searchLower[searchIndex]) {
      searchIndex++;
    }
  }
  
  return searchIndex === searchLower.length;
};

const filteredLogs = computed(() => {
  let filtered = logs.value;
  
  // Filter by level
  if (filterLevel.value !== 'all') {
    filtered = filtered.filter(log => log.level === filterLevel.value);
  }
  
  // Filter by search term - use fuzzy matching
  if (searchTerm.value && searchTerm.value.trim()) {
    const search = searchTerm.value.trim();
    filtered = filtered.filter(log => {
      // Search in message
      if (fuzzyMatch(log.message, search)) return true;
      // Search in source
      if (log.source && fuzzyMatch(log.source, search)) return true;
      // Search in meta (stringified)
      if (log.meta && fuzzyMatch(JSON.stringify(log.meta), search)) return true;
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

let searchTimeout: NodeJS.Timeout | null = null;

const setSearch = (e: Event) => {
  const target = e.target as HTMLInputElement;
  
  // Clear any existing timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  // Set a new timeout for debounced search
  searchTimeout = setTimeout(() => {
    actor.send({ type: 'SET_SEARCH', search: target.value });
  }, 150); // 150ms debounce - short enough to feel responsive
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
  
  // First try exact match highlighting
  const exactRegex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  if (text.match(exactRegex)) {
    return text.replace(exactRegex, '<mark class="bg-yellow-500/30 text-yellow-200">$1</mark>');
  }
  
  // If no exact match, highlight individual characters in fuzzy match
  const searchLower = search.toLowerCase();
  const textLower = text.toLowerCase();
  let result = '';
  let searchIndex = 0;
  
  for (let i = 0; i < text.length; i++) {
    if (searchIndex < searchLower.length && textLower[i] === searchLower[searchIndex]) {
      result += `<mark class="bg-yellow-500/30 text-yellow-200">${text[i]}</mark>`;
      searchIndex++;
    } else {
      result += text[i];
    }
  }
  
  return result;
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
  if (log.meta && Object.keys(log.meta).length > 0) available.push('meta');
  if (log.stack) available.push('stack');
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