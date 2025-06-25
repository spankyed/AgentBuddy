<template>
  <div class="logs-container">
    <!-- Enhanced Header -->
    <div class="logs-header">
      <div class="header-left">
        <div class="filter-group">
          <Filter :size="14" class="filter-icon" />
          <select 
            :value="filterLevel" 
            @change="setFilterLevel"
            class="level-filter"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        
        <div class="search-wrapper">
          <Search :size="14" class="search-icon" />
          <input
            :value="searchTerm"
            @input="setSearch"
            type="text"
            placeholder="Search logs, sources, or metadata..."
            class="search-input"
          />
        </div>
      </div>
      
      <div class="header-right">
        <div class="stats-group">
          <div class="stat-item">
            <span class="stat-value">{{ logs.length }}</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="stat-item error" v-if="errorCount > 0">
            <span class="stat-value">{{ errorCount }}</span>
            <span class="stat-label">Errors</span>
          </div>
          <div class="stat-item warn" v-if="warnCount > 0">
            <span class="stat-value">{{ warnCount }}</span>
            <span class="stat-label">Warnings</span>
          </div>
        </div>
        
        <div class="action-buttons">
          <button 
            @click="toggleAutoScroll"
            :class="['icon-btn', { active: autoScroll }]"
            title="Auto-scroll to new logs"
          >
            <ArrowDownToLine v-if="autoScroll" :size="16" />
            <ArrowDown v-else :size="16" />
          </button>
          
          <button 
            @click="clearLogs"
            class="icon-btn danger"
            title="Clear all logs"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Enhanced Logs Display -->
    <div ref="logsContent" class="logs-viewport">
      <TransitionGroup name="log-fade" tag="div" class="logs-list">
        <div 
          v-for="log in filteredLogs" 
          :key="log.id"
          :class="['log-item', `level-${log.level}`]"
        >
          <!-- Log Header -->
          <div class="log-header">
            <div class="log-meta-info">
              <span class="log-time">{{ formatTime(log.timestamp) }}</span>
              <span :class="['log-badge', `badge-${log.level}`]">
                <component :is="getLevelIcon(log.level)" :size="12" />
                {{ log.level }}
              </span>
              <span v-if="log.source" class="log-source">{{ log.source }}</span>
            </div>
          </div>
          
          <!-- Log Message -->
          <div class="log-body">
            <p class="log-message">{{ log.message }}</p>
            
            <!-- Enhanced Metadata Display -->
            <div v-if="log.meta && Object.keys(log.meta).length > 0" class="log-metadata">
              <button 
                @click="toggleMeta(log.id)"
                class="expand-btn"
              >
                <ChevronRight :class="['expand-icon', { expanded: expandedMeta.has(log.id) }]" :size="14" />
                Metadata
              </button>
              
              <Transition name="slide-fade">
                <div v-if="expandedMeta.has(log.id)" class="metadata-content">
                  <DataRenderer :data="log.meta" />
                </div>
              </Transition>
            </div>
            
            <!-- Enhanced Stack Trace Display -->
            <div v-if="log.stack" class="log-stacktrace">
              <button 
                @click="toggleStack(log.id)"
                class="expand-btn error"
              >
                <AlertCircle :class="['expand-icon', { expanded: expandedStacks.has(log.id) }]" :size="14" />
                Stack Trace
              </button>
              
              <Transition name="slide-fade">
                <div v-if="expandedStacks.has(log.id)" class="stacktrace-content">
                  <pre class="stack-pre">{{ formatStackTrace(log.stack) }}</pre>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </TransitionGroup>
      
      <!-- Empty State -->
      <div v-if="filteredLogs.length === 0" class="empty-state">
        <FileX :size="48" class="empty-icon" />
        <h3>{{ logs.length === 0 ? 'No logs recorded yet' : 'No logs match your filters' }}</h3>
        <p>{{ logs.length === 0 ? 'Logs will appear here as they are generated' : 'Try adjusting your filters or search query' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, reactive } from 'vue';
import { 
  Trash2, 
  Search, 
  Filter,
  ChevronRight,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  FileX,
  ArrowDown,
  ArrowDownToLine
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
const autoScroll = useSelector(actor, (s) => (s as any).context.autoScroll);

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

// Auto-scroll when new logs are added
watch(filteredLogs, async () => {
  if (autoScroll.value && logsContent.value) {
    await nextTick();
    logsContent.value.scrollTop = logsContent.value.scrollHeight;
  }
});
</script>

<style scoped>
/* Container Layout */
.logs-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0a0a0a;
  color: #e1e1e1;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
}

/* Enhanced Header */
.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #141414;
  border-bottom: 1px solid #262626;
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  gap: 16px;
  align-items: center;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #1a1a1a;
  border-radius: 8px;
  border: 1px solid #262626;
}

.filter-icon {
  color: #666;
}

.level-filter {
  background: transparent;
  border: none;
  color: #e1e1e1;
  font-size: 13px;
  font-weight: 500;
  outline: none;
  cursor: pointer;
}

.level-filter option {
  background: #1a1a1a;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: #666;
  pointer-events: none;
}

.search-input {
  padding: 8px 12px 8px 36px;
  width: 280px;
  background: #1a1a1a;
  border: 1px solid #262626;
  border-radius: 8px;
  color: #e1e1e1;
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: #404040;
  background: #1f1f1f;
}

.search-input::placeholder {
  color: #666;
}

.header-right {
  display: flex;
  gap: 20px;
  align-items: center;
}

/* Statistics */
.stats-group {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #e1e1e1;
}

.stat-label {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-item.error .stat-value {
  color: #ff4757;
}

.stat-item.warn .stat-value {
  color: #ffa502;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 8px;
}

.icon-btn {
  padding: 8px;
  background: #1a1a1a;
  border: 1px solid #262626;
  border-radius: 8px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: #262626;
  color: #e1e1e1;
  border-color: #404040;
}

.icon-btn.active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}

.icon-btn.danger:hover {
  background: #ff4757;
  color: white;
  border-color: #ff4757;
}

/* Logs Viewport */
.logs-viewport {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
}

.logs-list {
  padding: 12px;
}

/* Log Items */
.log-item {
  margin-bottom: 1px;
  background: #141414;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.log-item:hover {
  background: #1a1a1a;
  border-color: #262626;
}

/* Level-based styling */
.level-debug {
  border-left: 3px solid #6b7280;
}

.level-info {
  border-left: 3px solid #3b82f6;
}

.level-warn {
  border-left: 3px solid #ffa502;
}

.level-error {
  border-left: 3px solid #ff4757;
}

/* Log Header */
.log-header {
  padding: 12px 16px 8px;
}

.log-meta-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.log-time {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  color: #666;
}

.log-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-debug {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}

.badge-info {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.badge-warn {
  background: rgba(255, 165, 2, 0.2);
  color: #ffa502;
}

.badge-error {
  background: rgba(255, 71, 87, 0.2);
  color: #ff6b7a;
}

.log-source {
  font-size: 12px;
  color: #666;
  background: #1a1a1a;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
}

/* Log Body */
.log-body {
  padding: 0 16px 12px;
}

.log-message {
  margin: 0;
  color: #e1e1e1;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

/* Expandable Sections */
.log-metadata,
.log-stacktrace {
  margin-top: 12px;
}

.expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #1a1a1a;
  border: 1px solid #262626;
  border-radius: 6px;
  color: #999;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.expand-btn:hover {
  background: #262626;
  color: #e1e1e1;
  border-color: #404040;
}

.expand-btn.error {
  border-color: rgba(255, 71, 87, 0.3);
  color: #ff6b7a;
}

.expand-btn.error:hover {
  background: rgba(255, 71, 87, 0.1);
  border-color: rgba(255, 71, 87, 0.5);
}

.expand-icon {
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.metadata-content,
.stacktrace-content {
  margin-top: 8px;
  padding: 12px;
  background: #0a0a0a;
  border-radius: 6px;
  border: 1px solid #262626;
}

.stack-pre {
  margin: 0;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  color: #ff6b7a;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
}

.empty-icon {
  color: #404040;
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #666;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: #404040;
}

/* Animations */
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

/* Scrollbar Styling */
.logs-viewport::-webkit-scrollbar {
  width: 8px;
}

.logs-viewport::-webkit-scrollbar-track {
  background: #0a0a0a;
}

.logs-viewport::-webkit-scrollbar-thumb {
  background: #262626;
  border-radius: 4px;
}

.logs-viewport::-webkit-scrollbar-thumb:hover {
  background: #404040;
}
</style> 