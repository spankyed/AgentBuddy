<template>
  <div class="logs-container">
    <div class="logs-header">
      <div class="logs-filters">
        <select 
          v-model="filterLevel" 
          @change="setFilterLevel"
          class="filter-select"
        >
          <option value="all">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        
        <input
          v-model="searchTerm"
          @input="setSearch"
          type="text"
          placeholder="Search logs..."
          class="search-input"
        />
      </div>
      
      <div class="logs-actions">
        <div class="logs-stats">
          <span class="stat">Total: {{ logs.length }}</span>
          <span class="stat error" v-if="errorCount > 0">Errors: {{ errorCount }}</span>
          <span class="stat warn" v-if="warnCount > 0">Warnings: {{ warnCount }}</span>
        </div>
        
        <button 
          @click="toggleAutoScroll"
          :class="['auto-scroll-btn', { active: autoScroll }]"
          title="Toggle auto-scroll"
        >
          <ScrollText :size="16" />
        </button>
        
        <button 
          @click="clearLogs"
          class="clear-btn"
          title="Clear logs"
        >
          <Trash2 :size="16" />
        </button>
      </div>
    </div>
    
    <div ref="logsContent" class="logs-content">
      <div 
        v-for="log in filteredLogs" 
        :key="log.id"
        :class="['log-entry', `log-${log.level}`]"
      >
        <span class="log-timestamp">{{ formatTime(log.timestamp) }}</span>
        <span class="log-level">{{ log.level.toUpperCase() }}</span>
        <span v-if="log.source" class="log-source">[{{ log.source }}]</span>
        <span class="log-message">{{ log.message }}</span>
        
        <div v-if="log.meta" class="log-meta">
          <pre>{{ JSON.stringify(log.meta, null, 2) }}</pre>
        </div>
        
        <div v-if="log.stack" class="log-stack">
          <details>
            <summary>Stack trace</summary>
            <pre>{{ log.stack }}</pre>
          </details>
        </div>
      </div>
      
      <div v-if="filteredLogs.length === 0" class="no-logs">
        {{ logs.length === 0 ? 'No logs yet' : 'No logs match your filters' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { ScrollText, Trash2 } from 'lucide-vue-next';
import { id } from './state';
import type { LogsState, LogEntry } from './state';
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'


const props = defineProps<{
  actor: LogsState;
}>();

const actor: LogsState = applicationState.system.get(id)

const logsContent = ref<HTMLElement>();

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
  // const realLogs = state.value.context.logs;
  const realLogs = [];
  return realLogs.length > 0 ? realLogs : mockLogs;
});
const filterLevel = useSelector(actor, (s) => s.context.filter.level);
const searchTerm = useSelector(actor, (s) => s.context.filter.search);
const autoScroll = useSelector(actor, (s) => s.context.autoScroll);

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

const toggleAutoScroll = () => {
  actor.send({ type: 'TOGGLE_AUTO_SCROLL' });
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
    second: '2-digit',
    fractionalSecondDigits: 3
  });
};

// Auto-scroll when new logs are added
watch(filteredLogs, async () => {
  if (autoScroll.value && logsContent.value) {
    await nextTick();
    logsContent.value.scrollTop = logsContent.value.scrollHeight;
  }
});
</script>

<style scoped>
.logs-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-primary);
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.logs-filters {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-select {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 12px;
}

.search-input {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  width: 200px;
  font-size: 12px;
}

.logs-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.logs-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat.error {
  color: #d0021b;
}

.stat.warn {
  color: #f5a623;
}

.auto-scroll-btn,
.clear-btn {
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.auto-scroll-btn:hover,
.clear-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.auto-scroll-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.logs-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.log-entry {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  line-height: 1.4;
  word-break: break-word;
}

.log-entry:hover {
  background: var(--color-bg-secondary);
}

.log-timestamp {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.log-level {
  font-weight: bold;
  width: 50px;
  flex-shrink: 0;
}

.log-source {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.log-message {
  flex: 1;
  color: var(--color-text-primary);
}

.log-debug .log-level { color: #888; }
.log-info .log-level { color: #4a90e2; }
.log-warn .log-level { color: #f5a623; }
.log-error .log-level { color: #d0021b; }

.log-meta,
.log-stack {
  margin-top: 4px;
  margin-left: 200px;
}

.log-meta pre,
.log-stack pre {
  margin: 0;
  padding: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
}

.log-stack summary {
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.log-stack summary:hover {
  color: var(--color-text-primary);
}

.no-logs {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: 40px;
}
</style> 