import { computed, type Ref } from 'vue'
import { GitCommitHorizontal, Archive, GitFork } from 'lucide-vue-next'
import { useContextMenu, type MenuItem } from '@apackdev/ui/composables/useContextMenu'
import { useSettings } from '#generated/settings-fe.ts'
import type { CodeSettings } from '#generated/types.ts'

type SectionKey = 'showCommits' | 'showStashes' | 'showWorktrees'

export function useSectionVisibilityMenu(codeSettings: Ref<CodeSettings | undefined>) {
  const { showMenu, menuPos, open } = useContextMenu()
  const preferences = useSettings('code')

  const isVisible = (key: SectionKey) =>
    key === 'showCommits' ? codeSettings.value?.showCommits !== false : !!codeSettings.value?.[key]

  const toggle = (key: SectionKey) => {
    const value = !isVisible(key)
    const update = key === 'showCommits' ? { path: ['showCommits'] as const, value }
      : key === 'showStashes' ? { path: ['showStashes'] as const, value }
      : { path: ['showWorktrees'] as const, value }
    void preferences.set(update)
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
