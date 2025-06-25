<template>
  <div class="bg-neutral-900">
    <!-- Header -->
    <div class="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b bg-neutral-800 border-neutral-700">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-neutral-700 rounded-md">
          <Filter :size="14" class="text-neutral-400" />
          <select 
            :value="filterLevel" 
            @change="setFilterLevel"
            class="text-sm font-medium bg-transparent outline-none cursor-pointer text-neutral-200"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        
        <div class="relative flex items-center">
          <Search :size="14" class="absolute left-3 text-neutral-400" />
          <input
            :value="searchTerm"
            @input="setSearch"
            type="text"
            placeholder="Search logs, sources, or metadata..."
            class="pl-9 pr-4 py-1.5 w-72 bg-neutral-700 border border-neutral-600 rounded-md text-sm text-neutral-200 placeholder-neutral-400 outline-none focus:border-neutral-500 focus:bg-neutral-600 transition-colors"
          />
        </div>
      </div>
      
      <div class="flex items-center gap-6">
        <div class="flex gap-4">
          <div class="flex flex-col items-center">
            <span class="text-lg font-semibold text-neutral-200">{{ logs.length }}</span>
            <span class="text-xs tracking-wider uppercase text-neutral-500">Total</span>
          </div>
          <div v-if="errorCount > 0" class="flex flex-col items-center">
            <span class="text-lg font-semibold text-red-400">{{ errorCount }}</span>
            <span class="text-xs tracking-wider uppercase text-neutral-500">Errors</span>
          </div>
          <div v-if="warnCount > 0" class="flex flex-col items-center">
            <span class="text-lg font-semibold text-yellow-400">{{ warnCount }}</span>
            <span class="text-xs tracking-wider uppercase text-neutral-500">Warnings</span>
          </div>
        </div>
        
        <button 
          @click="clearLogs"
          class="p-2 transition-colors rounded-md bg-neutral-700 text-neutral-400 hover:bg-red-600 hover:text-white"
          title="Clear all logs"
        >
          <Eraser :size="16" />
        </button>
      </div>
    </div>
    
    <!-- Logs Content -->
    <div ref="logsContent" class="px-6 py-4">
      <TransitionGroup name="log-fade" tag="div" class="space-y-2">
        <div 
          v-for="log in filteredLogs" 
          :key="log.id"
          class="overflow-hidden transition-colors rounded-lg bg-neutral-800 hover:bg-neutral-750"
        >
          <div class="px-4 py-3">
            <!-- Log Header -->
            <div class="flex items-center gap-3 mb-2">
              <span class="font-mono text-xs text-neutral-500">{{ formatTime(log.timestamp) }}</span>
              
              <span :class="[
                'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded',
                {
                  'bg-neutral-700 text-neutral-400': log.level === 'debug',
                  'bg-blue-900/30 text-blue-400': log.level === 'info',
                  'bg-yellow-900/30 text-yellow-400': log.level === 'warn',
                  'bg-red-900/30 text-red-400': log.level === 'error'
                }
              ]">
                <component :is="getLevelIcon(log.level)" :size="12" />
                {{ log.level.toUpperCase() }}
              </span>
              
              <span v-if="log.source" class="px-2 py-0.5 bg-neutral-700 text-neutral-400 text-xs font-mono rounded">
                {{ log.source }}
              </span>
            </div>
            
            <!-- Log Message -->
            <p class="text-sm leading-relaxed text-neutral-200">{{ log.message }}</p>
            
            <!-- Metadata -->
            <div v-if="log.meta && Object.keys(log.meta).length > 0" class="mt-3">
              <button 
                @click="toggleMeta(log.id)"
                class="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-neutral-400 bg-neutral-700 rounded hover:bg-neutral-600 transition-colors"
              >
                <ChevronRight :class="['transition-transform', expandedMeta.has(log.id) && 'rotate-90']" :size="14" />
                Metadata
              </button>
              
              <Transition name="slide-fade">
                <div v-if="expandedMeta.has(log.id)" class="p-3 mt-2 rounded-md bg-neutral-900">
                  <DataRenderer :data="log.meta" />
                </div>
              </Transition>
            </div>
            
            <!-- Stack Trace -->
            <div v-if="log.stack" class="mt-3">
              <button 
                @click="toggleStack(log.id)"
                class="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-red-400 bg-red-900/20 rounded hover:bg-red-900/30 transition-colors"
              >
                <AlertCircle :class="['transition-transform', expandedStacks.has(log.id) && 'rotate-90']" :size="14" />
                Stack Trace
              </button>
              
              <Transition name="slide-fade">
                <div v-if="expandedStacks.has(log.id)" class="p-3 mt-2 rounded-md bg-neutral-900">
                  <pre class="font-mono text-xs text-red-400 whitespace-pre-wrap">{{ formatStackTrace(log.stack) }}</pre>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </TransitionGroup>
      
      <!-- Empty State -->
      <div v-if="filteredLogs.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
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
  Eraser, 
  Search, 
  Filter,
  ChevronRight,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  FileX
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
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
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
  transition: all 0.3s ease;
}

.log-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Custom hover state for log items */
.hover\:bg-neutral-750:hover {
  background-color: rgb(38 38 38 / 0.5);
}
</style> 