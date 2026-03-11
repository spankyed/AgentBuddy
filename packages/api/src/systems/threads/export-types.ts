export interface ExportedMessage {
  text: string
  sender: 'user' | 'assistant' | 'system'
  timestamp: number
}

export interface ExportedThreadLink {
  shortCode: string
  relation: 'parent_of' | 'blocks' | 'blocked_by' | 'duplicates'
}

export interface ExportedThread {
  topic: string
  instructions: string
  status: string
  tags: string[]
  shortCode: string
  timestamp: number
  sideTopics?: string[]
  pinned?: boolean
  messages: ExportedMessage[]
  linkedThreads: ExportedThreadLink[]
}

export interface ExportedThreadsData {
  version: 1
  threads: ExportedThread[]
}
