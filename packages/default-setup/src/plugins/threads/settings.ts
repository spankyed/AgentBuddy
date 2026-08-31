export default {
  plugins: {
    _meta: { visibility: { threads: true } },
    threads: {
      chat: {
        defaultMode: 'Claude Code',
        defaultPhase: 'Plan',
        modes: [
          { id: 'birth', name: 'Birth', description: 'Assistant onboarding and setup mode', hidden: true },
          {
            id: 'claude-code',
            name: 'Claude Code',
            description: 'Claude Code agent mode',
            phases: [
              { id: 'plan', name: 'Plan', description: 'Strategic planning and task breakdown', color: '#3B82F6' },
              { id: 'edit', name: 'Edit', description: 'Implementation and development', color: '#6B7280' },
            ]
          },
          {
            id: 'codex',
            name: 'Codex',
            description: 'OpenAI Codex agent mode',
            phases: [
              { id: 'plan', name: 'Plan', description: 'Strategic planning and exploration', color: '#3B82F6' },
              { id: 'default', name: 'Default', description: 'Implementation and development', color: '#6B7280' },
            ]
          },
          { id: 'manager', name: 'Manager', description: 'Delegate tasks and coordinate agents', hidden: true },
        ],
        hotkeys: {
          textToSpeech: { key: 'r', modifiers: ['cmd'], global: true },
          quickPrompts: { key: 'd', modifiers: ['cmd'], global: true },
          closeTab: { key: 'w', modifiers: ['cmd'] },
        },
        quickPrompts: [
          { id: 'qp_1', text: 'Write a commit message' },
          { id: 'qp_2', text: 'Plan thoroughly before implementing' },
          { id: 'qp_3', text: 'Please investigate thoroughly and report back.' },
          { id: 'qp_4', text: 'Conduct a thorough review of these changes for bugs and completeness, than report back with findings' },
          { id: 'qp_5', text: 'Cleanup the changes making making the code more succinct, simple, and maintainable.' },
          { id: 'qp_6', text: 'Summarize the conversation to a md file' },
        ],
        quickPromptNumberKeyInserts: true
      },
      statuses: [
        { label: 'Backlog', color: '#6B7280' },
        { label: 'Open', color: '#3B82F6' },
        { label: 'In Progress', color: '#F59E0B' },
        { label: 'In Review', color: '#A855F7' },
        { label: 'Done', color: '#10B981' }
      ],
      tags: [
        { name: 'High Priority', color: '#F59E0B' },
        { name: 'Low Priority', color: '#6B7280' },
        { name: 'Bug', color: '#EF4444' },
        { name: 'Feature', color: '#10B981' },
        { name: 'Enhancement', color: '#3B82F6' },
        { name: 'Documentation', color: '#6366F1' },
        { name: 'claude-code', color: '#7C3AED' },
      ],
      chatStates: [
        { id: 'idle',    label: 'Idle',    color: '#6B7280', busy: false },
        { id: 'working', label: 'Working', color: '#FACC15', busy: true },
        { id: 'paused',  label: 'Paused',  color: '#F59E0B', busy: false },
        { id: 'error',   label: 'Error',   color: '#EF4444', busy: false },
        { id: 'success', label: 'Success', color: '#10B981', busy: false },
      ],
      showOnlyRootThreads: false,
      clickToChat: true,
      recentThreadsLimit: 7,
      recentThreadsSortOrder: 'visited',
      recordingLimitMinutes: 3
    }
  }
}
