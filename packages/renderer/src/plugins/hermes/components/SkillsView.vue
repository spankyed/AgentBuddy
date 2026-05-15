<template>
  <div class="p-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium text-neutral-100">Skills</h2>
      <button
        @click="showCreateForm = true"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
      >
        <Plus class="w-3 h-3" />
        New Skill
      </button>
    </div>

    <!-- Create Form -->
    <div v-if="showCreateForm" class="mb-4 p-4 bg-neutral-800 rounded-lg border border-neutral-700">
      <div class="space-y-3">
        <input
          v-model="newSkill.name"
          placeholder="Skill name"
          class="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary-500"
        />
        <input
          v-model="newSkill.category"
          placeholder="Category (optional)"
          class="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary-500"
        />
        <textarea
          v-model="newSkill.content"
          placeholder="Skill content (markdown)"
          rows="6"
          class="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary-500 resize-y"
        />
        <div class="flex gap-2 justify-end">
          <button
            @click="showCreateForm = false"
            class="px-3 py-1.5 rounded-md text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            @click="handleSave"
            :disabled="!newSkill.name.trim()"
            class="px-3 py-1.5 rounded-md text-xs bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>

    <!-- Skills List grouped by category -->
    <div v-if="skills.length > 0" class="space-y-4">
      <div
        v-for="[category, categorySkills] in groupedSkills"
        :key="category"
      >
        <h3 class="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{{ category }}</h3>
        <div class="space-y-1">
          <div
            v-for="skill in categorySkills"
            :key="skill.path"
            class="flex items-center justify-between p-3 bg-neutral-800 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors group"
          >
            <div>
              <span class="text-sm text-neutral-200">{{ skill.name }}</span>
              <p v-if="skill.content" class="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                {{ skill.content }}
              </p>
            </div>
            <button
              @click="emit('deleteSkill', skill.path)"
              class="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-sm text-neutral-500 text-center py-12">
      No skills found. Create one to get started.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'

interface Skill {
  name: string
  category: string
  path: string
  content: string
}

const props = defineProps<{
  skills: Skill[]
}>()

const emit = defineEmits<{
  saveSkill: [event: { name: string; category?: string; content: string }]
  deleteSkill: [path: string]
}>()

const showCreateForm = ref(false)
const newSkill = ref({ name: '', category: '', content: '' })

const groupedSkills = computed(() => {
  const groups = new Map<string, Skill[]>()
  for (const skill of props.skills) {
    const cat = skill.category || 'uncategorized'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(skill)
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
})

function handleSave() {
  if (!newSkill.value.name.trim()) return
  emit('saveSkill', {
    name: newSkill.value.name,
    category: newSkill.value.category || undefined,
    content: newSkill.value.content,
  })
  newSkill.value = { name: '', category: '', content: '' }
  showCreateForm.value = false
}
</script>
