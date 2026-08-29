<template>
  <div class="flex flex-col h-full bg-neutral-900">
        <!-- Simplified Header -->
    <div class="border-b border-neutral-800">
      <!-- Search and Filters Row -->
      <div class="p-2">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <!-- Search Input -->
            <div class="relative w-96">
              <Search :size="16" class="absolute -translate-y-1/2 left-3 top-1/2 text-neutral-500" />
              <!-- <input
                :value="searchTerm"
                @input="setSearch"
                type="text"
                placeholder="Search logs..."
                class="w-full py-2 pl-10 pr-3 text-sm transition-colors border rounded-lg outline-none bg-neutral-800 placeholder-neutral-500"
                :class="searchTerm ? 'border-neutral-600 bg-neutral-800/70' : 'border-neutral-700 focus:border-neutral-600 focus:bg-neutral-800/50'"
              /> -->
              <input
                :value="searchTerm"
                @input="setSearch"
                type="text"
                placeholder="Filter logs by message, level, or source..."
                class="w-full py-2 pl-10 pr-3 text-sm transition-colors border rounded-lg outline-none bg-neutral-900 placeholder-neutral-500"
                :class="searchTerm ? 'border-neutral-600' : 'border-neutral-700 focus:border-neutral-600'"
              />
              <!-- Clear search button -->
              <button
                v-if="searchTerm"
                @click="clearSearch"
                class="absolute p-1 transition-colors -translate-y-1/2 right-2 top-1/2 text-neutral-500 hover:text-neutral-300"
              >
                <X :size="16" />
              </button>
            </div>

            <!-- Level Filter Pills -->
            <div class="flex items-center gap-1 px-3 py-1 rounded-lg bg-neutral-900">
              <button
                @click="setFilterLevelDirect('all')"
                class="px-3 py-1 text-sm font-medium transition-colors rounded"
                :class="filterLevel === 'all'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'"
              >
                All
                <span class="ml-1 text-sm opacity-60">
                  {{ (filterLevel !== 'all' || searchTerm) && filteredLogs.length !== logs.length
                    ? `${filteredLogs.length}/${logs.length}`
                    : logs.length
                  }}
                </span>
              </button>

              <button
                v-if="debugCount > 0"
                @click="setFilterLevelDirect('debug')"
                class="flex items-center gap-1 px-3 py-1 text-sm font-medium transition-colors rounded"
                :class="filterLevel === 'debug'
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'"
              >
                <Bug :size="14" />
                {{ filterLevel === 'debug' && searchTerm ? filteredLogs.length : debugCount }}
              </button>

              <button
                v-if="infoCount > 0"
                @click="setFilterLevelDirect('info')"
                class="flex items-center gap-1 px-3 py-1 text-sm font-medium transition-colors rounded"
                :class="filterLevel === 'info'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-blue-400/60 hover:text-blue-400'"
              >
                <Info :size="14" />
                {{ filterLevel === 'info' && searchTerm ? filteredLogs.length : infoCount }}
              </button>

              <button
                v-if="warnCount > 0"
                @click="setFilterLevelDirect('warn')"
                class="flex items-center gap-1 px-3 py-1 text-sm font-medium transition-colors rounded"
                :class="filterLevel === 'warn'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'text-yellow-400/60 hover:text-yellow-400'"
              >
                <AlertTriangle :size="14" />
                {{ filterLevel === 'warn' && searchTerm ? filteredLogs.length : warnCount }}
              </button>

              <button
                v-if="errorCount > 0"
                @click="setFilterLevelDirect('error')"
                class="flex items-center gap-1 px-3 py-1 text-sm font-medium transition-colors rounded"
                :class="filterLevel === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-red-400/60 hover:text-red-400'"
              >
                <AlertCircle :size="14" />
                {{ filterLevel === 'error' && searchTerm ? filteredLogs.length : errorCount }}
              </button>
            </div>

            <!-- App-events toggle -->
            <button
              @click="toggleShowAppEvents"
              class="flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded transition-colors"
              :class="settings.showAppEvents
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-300'"
              :title="settings.showAppEvents ? 'Hide app-events logs' : 'Show app-events logs'"
            >
              <Radio :size="14" />
              <span>app-events</span>
            </button>

            <!-- Excluded sources indicator -->
            <button
              v-if="settings.excludedSources && settings.excludedSources.length > 0"
              @click="goToExcludedSourcesSettings"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/20 border border-amber-700/30 rounded-lg hover:bg-amber-900/30 transition-colors cursor-pointer"
              title="Click to manage excluded sources"
            >
              <AlertTriangle :size="14" class="text-amber-500" />
              <span class="text-sm text-amber-400">
                {{ settings.excludedSources.length }} source{{ settings.excludedSources.length !== 1 ? 's' : '' }} excluded
              </span>
            </button>
          </div>

          <div class="flex items-center gap-1">
            <!-- Copy logs button -->
            <button
              @click="copyLogs"
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
              :class="copied ? 'text-green-400' : 'text-neutral-400 hover:text-neutral-200'"
              title="Copy logs to clipboard"
            >
              <component :is="copied ? Check : Copy" :size="16" />
              <span>{{ copied ? 'Copied' : 'Copy' }}</span>
            </button>

            <!-- Clear logs button -->
            <button
              @click="clearLogs"
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200"
              title="Clear all logs"
            >
              <Trash :size="16" />
              <span>Clear</span>
            </button>
          </div>
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
      <div v-else>
        <TransitionGroup name="log-fade">
          <div
            v-for="log in displayedLogs"
            :key="log.id"
            class="border-b border-neutral-800/30 group hover:bg-neutral-800/30"
          >
            <div
              class="flex items-center gap-2 px-4 py-1.5 cursor-pointer"
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
                  <span v-if="searchTerm" v-html="highlightSearchTermWrapper(log.message)"></span>
                  <span v-else>{{ log.message }}</span>
                </p>
              </div>

              <!-- Right side metadata -->
              <div class="flex items-center flex-shrink-0 gap-3 ml-auto text-sm">
                <!-- Source Badge (if exists) -->
                <span
                  v-if="log.source"
                  @contextmenu.prevent="(e) => openContextMenu(e, log.source)"
                  class="px-2 py-0.5 text-[11px] font-mono bg-neutral-800 text-neutral-400 rounded cursor-pointer hover:bg-neutral-700 transition-colors"
                  :title="`Right-click to exclude '${log.source}' from logs`"
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
                    <div class="text-sm font-medium text-neutral-400 mb-2">Metadata</div>
                    <DataRenderer :data="log.meta" />
                  </div>

                  <!-- Stack Trace -->
                  <div v-if="expandedContent.get(log.id) === 'stack' && log.stack" class="p-3 border rounded-lg bg-red-500/5 border-red-500/20">
                    <div class="flex items-center gap-1.5 mb-2">
                      <FileWarning :size="12" class="text-red-400" />
                      <span class="text-sm font-medium text-red-400">Stack Trace</span>
                    </div>
                    <pre class="font-mono text-sm whitespace-pre-wrap text-red-300/90">{{ formatStackTrace(log.stack) }}</pre>
                  </div>

                  <!-- Content type toggles -->
                  <div v-if="getAvailableContent(log).length > 1" class="flex gap-2 mt-2">
                    <button
                      v-if="log.meta && Object.keys(log.meta).length > 0"
                      @click.stop="toggleContent(log.id, 'meta')"
                      class="px-2 py-1 text-sm transition-colors rounded"
                      :class="expandedContent.get(log.id) === 'meta'
                        ? 'bg-neutral-700 text-neutral-200'
                        : 'text-neutral-400 hover:text-neutral-200'"
                    >
                      View metadata
                    </button>
                    <button
                      v-if="log.stack"
                      @click.stop="toggleContent(log.id, 'stack')"
                      class="px-2 py-1 text-sm transition-colors rounded"
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
        <div v-if="hasMore" ref="sentinel" class="flex items-center justify-center py-3 text-sm text-neutral-500">
          Showing {{ displayedLogs.length }} of {{ filteredLogs.length }} logs
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        @click="closeContextMenu"
        class="fixed inset-0 z-50"
      >
        <div
          class="absolute bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[220px] shadow-xl"
          :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
          @click.stop
        >
          <button
            @click="() => excludeSource(contextMenu.source)"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded text-neutral-50 hover:bg-neutral-700 transition-colors text-left"
            :disabled="settings.excludedSources.includes(contextMenu.source)"
          >
            <X :size="14" class="text-red-400" />
            <span class="flex-1">Exclude '{{ contextMenu.source }}'</span>
          </button>
          <div v-if="!settings.excludedSources.includes(contextMenu.source)" class="px-3 py-1 text-xs text-neutral-500">
            Hide all logs from this source
          </div>
          <div v-else class="px-3 py-1 text-xs text-amber-500">
            Already excluded
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, onMounted, onUnmounted } from 'vue';
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
  Trash,
  Radio,
  Copy,
  Check
} from 'lucide-vue-next';
import { id } from './state';
import type { LogsState, LogEntry } from './state';
import { useSelector } from '@xstate/vue';
import DataRenderer from './data-renderer.vue';
import { applicationState } from '@/main';
import { navigateToPlugin } from '@/core/utils/navigate';
import { parseSearchTerm, searchLog, highlightSearchTerm } from './search';

const logsContent = ref<HTMLElement>();

// Add escape key handler for context menu
const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && contextMenu.visible) {
    closeContextMenu();
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleEscape);

  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && hasMore.value) {
      displayLimit.value += BATCH_SIZE;
    }
  });

  watch(sentinel, (el) => {
    if (el) observer?.observe(el);
  }, { immediate: true });
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape);
  observer?.disconnect();
});

// Simple content type tracking
// To add new content types:
// 1. Add to type union (e.g., 'perf')
// 2. Update getAvailableContent()
// 3. Add button and content display
type ContentType = 'meta' | 'stack';
const expandedContent = reactive(new Map<string, ContentType | null>());

// Context menu state
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  source: ''
});

const actor: LogsState = applicationState.system.get(id)
const logs = useSelector(actor, (s) => (s as any).context.logs);
const filterLevel = useSelector(actor, (s) => (s as any).context.filter.level);
const searchTerm = useSelector(actor, (s) => (s as any).context.filter.search);
const settings = useSelector(actor, (s) => (s as any).context.settings);

const filteredLogs = computed(() => {
  let filtered = logs.value;

  // Filter by level
  if (filterLevel.value !== 'all') {
    filtered = filtered.filter((log: LogEntry) => log.level === filterLevel.value);
  }

  // Filter by search term using the search utility
  if (searchTerm.value && searchTerm.value.trim()) {
    const filter = parseSearchTerm(searchTerm.value);
    filtered = filtered.filter((log: LogEntry) => searchLog(log, filter));
  }

  return filtered;
});

const BATCH_SIZE = 100;
const displayLimit = ref(BATCH_SIZE);
const displayedLogs = computed(() => filteredLogs.value.slice(0, displayLimit.value));
const hasMore = computed(() => displayLimit.value < filteredLogs.value.length);

watch(filteredLogs, () => {
  displayLimit.value = BATCH_SIZE;
});

const sentinel = ref<HTMLElement>();
let observer: IntersectionObserver | null = null;

const errorCount = computed(() => logs.value.filter((log: LogEntry) => log.level === 'error').length);
const warnCount = computed(() => logs.value.filter((log: LogEntry) => log.level === 'warn').length);
const infoCount = computed(() => logs.value.filter((log: LogEntry) => log.level === 'info').length);
const debugCount = computed(() => logs.value.filter((log: LogEntry) => log.level === 'debug').length);

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

const copied = ref(false);
let copiedTimeout: ReturnType<typeof setTimeout> | null = null;

const copyLogs = async () => {
  const text = filteredLogs.value
    .map((log: LogEntry) => {
      const time = formatTime(log.timestamp);
      const level = log.level.toUpperCase();
      const source = log.source ? `[${log.source}]` : '';
      let line = `${time} ${level} ${source} ${log.message}`;
      if (log.meta && Object.keys(log.meta).length > 0) {
        line += `\n  meta: ${JSON.stringify(log.meta, null, 2).split('\n').join('\n  ')}`;
      }
      if (log.stack) {
        line += `\n  stack: ${log.stack}`;
      }
      return line;
    })
    .join('\n');

  await navigator.clipboard.writeText(text);

  if (copiedTimeout) clearTimeout(copiedTimeout);
  copied.value = true;
  copiedTimeout = setTimeout(() => { copied.value = false; }, 2000);
};

const goToExcludedSourcesSettings = () => {
  navigateToPlugin('settings', [
    { type: 'TAB.SELECT', tab: 'plugins' },
    { type: 'PLUGIN.SELECT', pluginId: 'logs' }
  ]);
};

// Wrapper for the imported highlight function
const highlightSearchTermWrapper = (text: string): string => {
  return highlightSearchTerm(text, searchTerm.value);
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

// Context menu methods
const openContextMenu = (event: MouseEvent, source: string) => {
  // Calculate position to ensure menu stays within viewport
  const menuWidth = 250; // Approximate width
  const menuHeight = 100; // Approximate height

  let x = event.clientX;
  let y = event.clientY;

  // Adjust if menu would go off right edge
  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 10;
  }

  // Adjust if menu would go off bottom edge
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 10;
  }

  contextMenu.visible = true;
  contextMenu.x = x;
  contextMenu.y = y;
  contextMenu.source = source;
};

const closeContextMenu = () => {
  contextMenu.visible = false;
};

const toggleShowAppEvents = () => {
  const next = !settings.value.showAppEvents;

  // Optimistic local update so the toggle state flips immediately.
  actor.send({
    type: 'LOGS_SETTINGS_UPDATED',
    settings: { ...settings.value, showAppEvents: next }
  });

  // Persist to settings (will round-trip back and trigger backend rebroadcast).
  const settingsActor = applicationState.system.get('settings');
  settingsActor.send({
    type: 'SETTINGS.UPDATE',
    entityType: 'plugin',
    label: 'logs',
    path: ['showAppEvents'],
    value: next
  });
};

const excludeSource = (source: string) => {
  if (!settings.value.excludedSources.includes(source)) {
    // Get current excluded sources
    const currentExcludedSources = settings.value.excludedSources || [];

    // Add the new source
    const updatedSources = [...currentExcludedSources, source];

    // Optimistically update the local logs state
    actor.send({
      type: 'LOGS_SETTINGS_UPDATED',
      settings: {
        ...settings.value,
        excludedSources: updatedSources
      }
    });

    // Send update to settings (this will persist it and eventually send it back)
    const settingsActor = applicationState.system.get('settings');
    settingsActor.send({
      type: 'SETTINGS.UPDATE',
      entityType: 'plugin',
      label: 'logs',
      path: ['excludedSources'],
      value: updatedSources
    });
  }

  closeContextMenu();
};
</script>

<style scoped>
/* Vue Transitions */
.log-fade-enter-active {
  transition: opacity 0.6s ease;
}

.log-fade-enter-from {
  opacity: 0;
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
