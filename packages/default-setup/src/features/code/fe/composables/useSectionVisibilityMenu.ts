import { computed, type Ref } from 'vue'
import { GitCommitHorizontal, Archive, GitFork } from 'lucide-vue-next'
import { useContextMenu, type MenuItem } from '@/core/composables/useContextMenu'
import { useSettingsSaveStatus } from '@/core/composables/useSettingsSaveStatus'
import type { CodeSettings } from '@app/api'

type SectionKey = 'showCommits' | 'showStashes' | 'showWorktrees'

export function useSectionVisibilityMenu(codeSettings: Ref<CodeSettings | undefined>) {
  const { showMenu, menuPos, open } = useContextMenu()
  const { updateSettings } = useSettingsSaveStatus()

  const isVisible = (key: SectionKey) =>
    key === 'showCommits' ? codeSettings.value?.showCommits !== false : !!codeSettings.value?.[key]

  const toggle = (key: SectionKey) => {
    updateSettings({ entityType: 'plugin', label: 'code', path: [key], value: !isVisible(key) })
  }

  const sectionMenuItems = computed<MenuItem[]>(() =>
    ([
      { label: 'Commits', icon: GitCommitHorizontal, key: 'showCommits' as SectionKey },
      { label: 'Stashes', icon: Archive, key: 'showStashes' as SectionKey },
      { label: 'Worktrees', icon: GitFork, key: 'showWorktrees' as SectionKey },
    ]).map(({ label, icon, key }) => {
      const cls = isVisible(key) ? 'text-neutral-200' : 'text-neutral-500'
      return { label, icon, class: cls, iconClass: cls, action: () => toggle(key), keepOpen: true }
    })
  )

  const onSectionContextMenu = (e: MouseEvent) => open(e, sectionMenuItems.value.length)

  return { showMenu, menuPos, sectionMenuItems, onSectionContextMenu }
}
