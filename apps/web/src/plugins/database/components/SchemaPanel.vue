<template>
  <div class="flex flex-col h-full">
    <!-- Header with Search -->
    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
      <!-- Search Input -->
      <div class="relative">
        <Search class="absolute w-4 h-4 text-gray-400 transform -translate-y-1/2 left-3 top-1/2" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search schema..."
          class="w-full py-2 pl-10 pr-4 text-sm border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute p-1 transform -translate-y-1/2 rounded right-2 top-1/2 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <X class="w-3 h-3 text-gray-500" />
        </button>
      </div>
    </div>
    
    <!-- Schema Tree -->
    <div class="flex-1 p-2 overflow-y-auto">
      <div
        v-for="category in filteredCategories"
        :key="category.id"
        class="mb-2"
      >
        <!-- Category header -->
        <div 
          class="flex items-center px-3 py-2 transition-colors duration-150 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 group"
          @click="toggleExpanded(category.id)"
        >
          <ChevronRight
            v-if="category.children.length > 0"
            :class="[
              'w-4 h-4 mr-2 transition-transform duration-200 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300',
              expandedItems.includes(category.id) && 'rotate-90'
            ]"
          />
          <component
            :is="getCategoryIcon(category.id)"
            :class="[
              'w-4 h-4 mr-2.5',
              getCategoryColor(category.id)
            ]"
          />
          <span class="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ category.label }}
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {{ category.children.length }}
          </span>
        </div>
        
        <!-- Category items -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="-translate-y-1 opacity-0"
          enter-to-class="translate-y-0 opacity-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="translate-y-0 opacity-100"
          leave-to-class="-translate-y-1 opacity-0"
        >
          <div
            v-if="expandedItems.includes(category.id) && category.children.length > 0"
            class="ml-3 mt-1 space-y-0.5"
          >
            <div
              v-for="child in category.children"
              :key="child.id"
              :class="[
                'group flex items-center py-1.5 px-3 rounded-lg cursor-pointer text-sm transition-all duration-150',
                selectedItemId === child.id 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-400'
              ]"
              @click="selectItem(child)"
              :title="child.description || child.label"
            >
              <component
                :is="getItemIcon(category.id)"
                :class="[
                  'w-3 h-3 mr-2.5 transition-colors',
                  selectedItemId === child.id 
                    ? 'text-blue-500 dark:text-blue-400' 
                    : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                ]"
              />
              <span class="flex-1 truncate">{{ child.label }}</span>
              <ChevronRight 
                :class="[
                  'w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity',
                  selectedItemId === child.id && 'opacity-100'
                ]" 
              />
            </div>
          </div>
        </Transition>
      </div>
      
      <!-- Empty state -->
      <div v-if="filteredCategories.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
        <Search class="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
        <p class="text-sm text-gray-500 dark:text-gray-400">
          No results found for "{{ searchQuery }}"
        </p>
        <button
          @click="searchQuery = ''"
          class="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Clear search
        </button>
      </div>
    </div>
    
    <!-- Footer Actions -->
    <div class="p-3 border-t border-gray-200 dark:border-gray-700">
      <button
        @click="collapseAll"
        class="w-full px-3 py-2 text-sm text-gray-600 transition-colors rounded-lg dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <FoldVertical class="inline-block w-4 h-4 mr-2" />
        Collapse All
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  ChevronRight, 
  Database, 
  Tag, 
  Link, 
  Box, 
  Hash, 
  Network, 
  Search, 
  X,
  FoldVertical 
} from 'lucide-vue-next';
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/app'

const actor: DatabaseState = applicationState.system.get(id)
const schema = useSelector(actor, (state) => state.context.schema);

const searchQuery = ref('');
const expandedItems = ref<string[]>(['entities', 'attributes', 'relations']);
const selectedItemId = ref<string | null>(null);

interface TreeItem {
  id: string;
  label: string;
  description?: string;
  type: 'entity' | 'attribute' | 'relation';
  value: string;
}

interface TreeCategory {
  id: string;
  label: string;
  children: TreeItem[];
}

const treeCategories = computed<TreeCategory[]>(() => [
  {
    id: 'entities',
    label: 'Entities',
    children: schema.value.entities.map(entity => ({
      id: `entity:${entity.type}`,
      label: entity.type,
      type: 'entity' as const,
      value: entity.type
    }))
  },
  {
    id: 'attributes',
    label: 'Attributes',
    children: schema.value.attributes.map(attr => ({
      id: `attribute:${attr.kind}`,
      label: attr.kind,
      type: 'attribute' as const,
      value: attr.kind
    }))
  },
  {
    id: 'relations',
    label: 'Relations',
    children: schema.value.relations.map(rel => ({
      id: `relation:${rel.kind}`,
      label: rel.kind,
      type: 'relation' as const,
      value: rel.kind
    }))
  }
]);

const filteredCategories = computed(() => {
  if (!searchQuery.value) return treeCategories.value;
  
  const query = searchQuery.value.toLowerCase();
  return treeCategories.value
    .map(category => ({
      ...category,
      children: category.children.filter(child => 
        child.label.toLowerCase().includes(query) ||
        (child.description && child.description.toLowerCase().includes(query))
      )
    }))
    .filter(category => category.children.length > 0);
});

function toggleExpanded(id: string) {
  const index = expandedItems.value.indexOf(id);
  if (index > -1) {
    expandedItems.value.splice(index, 1);
  } else {
    expandedItems.value.push(id);
  }
}

function collapseAll() {
  expandedItems.value = [];
}

function getCategoryIcon(categoryId: string) {
  switch (categoryId) {
    case 'entities':
      return Database;
    case 'attributes':
      return Tag;
    case 'relations':
      return Link;
    default:
      return Box;
  }
}

function getCategoryColor(categoryId: string) {
  switch (categoryId) {
    case 'entities':
      return 'text-blue-500 dark:text-blue-400';
    case 'attributes':
      return 'text-green-500 dark:text-green-400';
    case 'relations':
      return 'text-purple-500 dark:text-purple-400';
    default:
      return 'text-gray-500 dark:text-gray-400';
  }
}

function getItemIcon(categoryId: string) {
  switch (categoryId) {
    case 'entities':
      return Box;
    case 'attributes':
      return Hash;
    case 'relations':
      return Network;
    default:
      return Box;
  }
}

function selectItem(item: TreeItem) {
  selectedItemId.value = item.id;
  
  actor.send({
    type: 'SCHEMA.SELECT',
    itemType: item.type,
    value: item.value
  });
}
</script> 