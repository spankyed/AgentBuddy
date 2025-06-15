<template>
  <div class="p-4 space-y-1">
    <h3 class="mb-4 text-lg font-semibold">Schema</h3>
    
    <div
      v-for="category in treeCategories"
      :key="category.id"
      class="select-none"
    >
      <!-- Category header -->
      <div 
        class="flex items-center py-1.5 px-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
        @click="toggleExpanded(category.id)"
      >
        <ChevronRight
          v-if="category.children.length > 0"
          :class="[
            'w-4 h-4 mr-1 transition-transform duration-200',
            expandedItems.includes(category.id) && 'rotate-90'
          ]"
        />
        <component
          :is="getCategoryIcon(category.id)"
          class="w-4 h-4 mr-2"
        />
        <span class="text-sm font-medium">{{ category.label }}</span>
      </div>
      
      <!-- Category items -->
      <div
        v-if="expandedItems.includes(category.id) && category.children.length > 0"
        class="ml-5 space-y-0.5"
      >
        <div
          v-for="child in category.children"
          :key="child.id"
          :class="[
            'flex items-center py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer text-sm',
            selectedItemId === child.id && 'bg-blue-100 dark:bg-blue-900'
          ]"
          @click="selectItem(child)"
        >
          <component
            :is="getItemIcon(category.id)"
            class="w-3 h-3 mr-2"
          />
          <span>{{ child.label }}</span>
          <!-- <span v-if="child.description" class="ml-2 text-xs text-gray-500">
            {{ child.description }}
          </span> -->
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ChevronRight, Database, Tag, Link, Box, Hash, Network } from 'lucide-vue-next';
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/app'

const actor: DatabaseState = applicationState.system.get(id)
const schema = useSelector(actor, (state) => state.context.schema);

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
      description: entity.description,
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
      description: attr.description,
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
      description: rel.description,
      type: 'relation' as const,
      value: rel.kind
    }))
  }
]);

function toggleExpanded(id: string) {
  const index = expandedItems.value.indexOf(id);
  if (index > -1) {
    expandedItems.value.splice(index, 1);
  } else {
    expandedItems.value.push(id);
  }
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