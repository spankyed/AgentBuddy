<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between flex-shrink-0 px-3 py-2 border-b bg-neutral-800/95 backdrop-blur-sm border-neutral-700">
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
        <!-- Compact Stats -->
        <div class="flex items-center gap-3 text-sm">
          <div class="flex items-center gap-1.5">
            <span class="text-neutral-500">Total:</span>
            <span class="font-medium text-neutral-300">{{ logs.length }}</span>
          </div>
          <div v-if="errorCount > 0" class="flex items-center gap-1.5">
            <div class="w-1.5 h-1.5 rounded-full bg-red-400"></div>
            <span class="font-medium text-red-400">{{ errorCount }}</span>
          </div>
          <div v-if="warnCount > 0" class="flex items-center gap-1.5">
            <div class="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
            <span class="font-medium text-yellow-400">{{ warnCount }}</span>
          </div>
        </div>
        
        <!-- Clear Button -->
        <button 
          @click="clearLogs"
          class="px-2.5 py-1 text-sm font-medium transition-all rounded bg-neutral-700 text-neutral-400 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/20"
          title="Clear all logs"
        >
          Clear
        </button>
      </div>
    </div>
    
    <!-- Logs Content -->
    <div ref="logsContent" class="flex-1 min-h-0 px-3 py-2 bg-neutral-900">
      <div v-if="filteredLogs.length > 0" class="space-y-0.5">
        <TransitionGroup name="log-fade">
          <div 
            v-for="log in filteredLogs" 
            :key="log.id"
            class="group"
          >
            <div class="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-800/50 transition-colors rounded">
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
              <div class="flex items-center gap-0.5 flex-shrink-0 mr-1">
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
                <div v-if="expandedMeta.has(log.id)" class="ml-4 mr-3 p-2.5 bg-neutral-800/30 rounded-md">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <Code2 :size="12" class="text-blue-400" />
                    <span class="text-sm font-medium text-blue-400">Metadata</span>
                  </div>
                  <DataRenderer :data="log.meta" />
                </div>
                
                <div v-if="expandedStacks.has(log.id)" class="ml-4 mr-3 mt-1 p-2.5 bg-red-500/5 border border-red-500/10 rounded-md">
                  <div class="flex items-center gap-1.5 mb-1.5">
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
      
      <!-- Empty State -->
      <div v-if="filteredLogs.length === 0" class="flex flex-col items-center justify-center h-full text-center">
        <FileX :size="48" class="mb-4 text-neutral-600" />
        <h3 class="mb-2 text-lg font-semibold text-neutral-400">
          {{ logs.length === 0 ? 'No logs recorded yet' : 'No logs match your filters' }}
        </h3>
        <p class="text-sm text-neutral-500">
          {{ logs.length === 0 ? 'Logs will appear here as they are generated' : 'Try adjusting your filters or search query' }}
        </p>
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
  FileWarning
} from 'lucide-vue-next';
import { id } from './state';
import type { LogsState, LogEntry } from './state';
import { useSelector } from '@xstate/vue';
import DataRenderer from './DataRenderer.vue';
import { applicationState } from '@/app'

const actor: LogsState = applicationState.system.get(id)

const props = defineProps<{
  actor: LogsState;
}>();

const logsContent = ref<HTMLElement>();
const expandedMeta = reactive(new Set<string>());
const expandedStacks = reactive(new Set<string>());

// Mock data for development
const mockLogs: LogEntry[] = [
  {
    id: '1',
    timestamp: Date.now() - 10000,
    level: 'info',
    message: 'Application started successfully',
    source: 'backend',
  },
  {
    id: '2',
    timestamp: Date.now() - 9000,
    level: 'debug',
    message: 'Connecting to database...',
    source: 'database',
  },
  {
    id: '3',
    timestamp: Date.now() - 8500,
    level: 'info',
    message: 'Database connection established',
    source: 'database',
    meta: {
      host: 'localhost',
      port: 5432,
      database: 'agentbuddy'
    }
  },
  {
    id: '4',
    timestamp: Date.now() - 7000,
    level: 'info',
    message: 'Starting agent system',
    source: 'agent',
  },
  {
    id: '5',
    timestamp: Date.now() - 6000,
    level: 'warn',
    message: 'Rate limit approaching threshold',
    source: 'api',
    meta: {
      current: 85,
      limit: 100,
      resetIn: '5 minutes'
    }
  },
  {
    id: '6',
    timestamp: Date.now() - 5000,
    level: 'error',
    message: 'Failed to fetch user preferences',
    source: 'api',
    stack: `Error: Failed to fetch user preferences
    at fetchUserPreferences (/app/src/api/user.ts:45:11)
    at async handleRequest (/app/src/api/handler.ts:23:5)
    at async processRequest (/app/src/server.ts:156:3)`,
    meta: {
      userId: 'user-123',
      endpoint: '/api/preferences'
    }
  },
  {
    id: '7',
    timestamp: Date.now() - 4000,
    level: 'info',
    message: 'Retrying user preferences fetch...',
    source: 'api',
  },
  {
    id: '8',
    timestamp: Date.now() - 3500,
    level: 'info',
    message: 'Successfully fetched user preferences on retry',
    source: 'api',
  },
  {
    id: '9',
    timestamp: Date.now() - 2000,
    level: 'debug',
    message: 'Processing message from user',
    source: 'agent',
    meta: {
      messageId: 'msg-456',
      wordCount: 42
    }
  },
  {
    id: '10',
    timestamp: Date.now() - 1000,
    level: 'info',
    message: 'Generated response in 234ms',
    source: 'agent',
  },
  {
    id: '11',
    timestamp: Date.now() - 500,
    level: 'warn',
    message: 'Memory usage above 80%',
    source: 'system',
    meta: {
      used: '1.6GB',
      total: '2GB',
      percentage: 82
    }
  },
];

const logs = computed(() => {
  // Use mock data if no real logs yet
  const realLogs = useSelector(actor, (s) => (s as any).context.logs).value || [];
  return realLogs.length > 0 ? realLogs : mockLogs;
});

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

const setFilterLevel = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  actor.send({ type: 'SET_FILTER_LEVEL', level: target.value as any });
};

const setSearch = (e: Event) => {
  const target = e.target as HTMLInputElement;
  actor.send({ type: 'SET_SEARCH', search: target.value });
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