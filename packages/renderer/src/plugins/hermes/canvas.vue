<template>
  <div class="flex h-full">
    <!-- Sidebar Navigation -->
    <div class="w-48 p-2 bg-neutral-900 border-r border-neutral-800 overflow-auto flex flex-col">
      <!-- Connection Status -->
      <div class="px-3 py-2 mb-2">
        <div class="flex items-center gap-2 text-xs">
          <div
            :class="[
              'w-2 h-2 rounded-full',
              installStatus === 'not_installed' || installStatus === 'unknown' ? 'bg-neutral-600' :
              installStatus === 'installing' ? 'bg-yellow-500 animate-pulse' :
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'error' || installStatus === 'error' ? 'bg-red-500' :
              'bg-neutral-500'
            ]"
          />
          <span class="text-neutral-400">
            {{
              installStatus === 'not_installed' || installStatus === 'unknown' ? 'Not Installed' :
              installStatus === 'installing' ? 'Installing...' :
              installStatus === 'error' ? 'Install Error' :
              connectionStatus === 'connected' ? 'Connected' :
              connectionStatus === 'error' ? 'Error' : 'Disconnected'
            }}
          </span>
        </div>
      </div>

      <!-- Nav Items -->
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="selectView(item.id)"
        :class="[
          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5',
          activeView === item.id
            ? 'bg-primary-500/20 text-primary-400'
            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
        ]"
      >
        <component :is="item.icon" class="w-4 h-4" />
        {{ item.label }}
      </button>

      <!-- Settings link → navigates to Settings plugin -->
      <button
        @click="goToSettings"
        class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
      >
        <Settings class="w-4 h-4" />
        Settings
      </button>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Bridge Controls -->
      <div class="px-3 py-2 border-t border-neutral-800 mt-2">
        <template v-if="installStatus === 'not_installed' || installStatus === 'unknown'">
          <button
            @click="install"
            class="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
          >
            <Download class="w-3 h-3" />
            Install Hermes
          </button>
        </template>
        <template v-else-if="installStatus === 'installing'">
          <div class="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-neutral-400">
            <Loader2 class="w-3 h-3 animate-spin" />
            Installing...
          </div>
        </template>
        <template v-else-if="installStatus === 'installed'">
          <button
            v-if="connectionStatus !== 'connected'"
            @click="startBridge"
            class="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
          >
            <Play class="w-3 h-3" />
            Start Bridge
          </button>
          <button
            v-else
            @click="stopBridge"
            class="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
          >
            <Square class="w-3 h-3" />
            Stop Bridge
          </button>
        </template>
        <template v-else-if="installStatus === 'error'">
          <button
            @click="install"
            class="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
          >
            <Download class="w-3 h-3" />
            Retry Install
          </button>
        </template>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-auto">
      <component
        :is="viewComponents[activeView]"
        :skills="skills"
        :models="models"
        :tools="tools"
        :enabled-toolsets="enabledToolsets"
        :persona="persona"
        :persona-path="personaPath"
        :memory="memory"
        :workspaces="workspaces"
        :sessions="sessions"
        :connection-status="connectionStatus"
        :install-status="installStatus"
        :version="version"
        :source="source"
        @save-skill="saveSkill"
        @delete-skill="deleteSkill"
        @update-persona="updatePersona"
        @write-memory="writeMemory"
        @refresh-sessions="refreshSessions"
        @resume-session="resumeSession"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id, type HermesView } from './state'
import {
  Bot,
  Zap,
  User,
  Brain,
  Wrench,
  Settings,
  Play,
  Square,
  Download,
  Loader2,
} from 'lucide-vue-next'
import SkillsView from './components/SkillsView.vue'
import PersonaView from './components/PersonaView.vue'
import MemoryView from './components/MemoryView.vue'
import ToolsView from './components/ToolsView.vue'
import AgentsView from './components/AgentsView.vue'

const actor = applicationState.system.get(id)

const activeView = useSelector(actor, (s: any) => s.context.activeView as HermesView)
const connectionStatus = useSelector(actor, (s: any) => s.context.connectionStatus)
const installStatus = useSelector(actor, (s: any) => s.context.installStatus)
const version = useSelector(actor, (s: any) => s.context.version)
const source = useSelector(actor, (s: any) => s.context.source)
const skills = useSelector(actor, (s: any) => s.context.skills)
const models = useSelector(actor, (s: any) => s.context.models)
const tools = useSelector(actor, (s: any) => s.context.tools)
const enabledToolsets = useSelector(actor, (s: any) => s.context.enabledToolsets)
const persona = useSelector(actor, (s: any) => s.context.persona)
const personaPath = useSelector(actor, (s: any) => s.context.personaPath)
const memory = useSelector(actor, (s: any) => s.context.memory)
const workspaces = useSelector(actor, (s: any) => s.context.workspaces)
const sessions = useSelector(actor, (s: any) => s.context.sessions)

const navItems = [
  { id: 'agents' as HermesView, label: 'Agents', icon: Bot },
  { id: 'skills' as HermesView, label: 'Skills', icon: Zap },
  { id: 'persona' as HermesView, label: 'Persona', icon: User },
  { id: 'memory' as HermesView, label: 'Memory', icon: Brain },
  { id: 'tools' as HermesView, label: 'Tools', icon: Wrench },
]

const viewComponents: Record<HermesView, any> = {
  agents: AgentsView,
  skills: SkillsView,
  persona: PersonaView,
  memory: MemoryView,
  tools: ToolsView,
}

const selectView = (view: HermesView) => {
  actor.send({ type: 'VIEW.SELECT', view })
}

const install = () => actor.send({ type: 'INSTALL' })
const startBridge = () => actor.send({ type: 'BRIDGE.START' })
const stopBridge = () => actor.send({ type: 'BRIDGE.STOP' })
const goToSettings = () => {
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'settings' } as any)
  const settingsActor = applicationState.system.get('settings')
  settingsActor.send({ type: 'TAB.SELECT', tab: 'plugins' })
  settingsActor.send({ type: 'PLUGIN.SELECT', pluginId: 'hermes' })
}
const refreshSessions = () => actor.send({ type: 'REFRESH' })
const resumeSession = (sessionId: string) => {
  // TODO: wire session resume to thread creation in hermes mode
  console.log('Resume session:', sessionId)
}

const saveSkill = (event: { name: string; category?: string; content: string }) => {
  actor.send({ type: 'SKILL.SAVE', ...event })
}
const deleteSkill = (path: string) => {
  actor.send({ type: 'SKILL.DELETE', path })
}
const updatePersona = (content: string) => {
  actor.send({ type: 'PERSONA.UPDATE', content })
}
const writeMemory = (event: { filename: string; content: string }) => {
  actor.send({ type: 'MEMORY.WRITE', ...event })
}
</script>
