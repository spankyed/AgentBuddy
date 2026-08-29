const TAGS_KEY = 'library-tags'
const TAG_USAGE_KEY = 'library-tag-usage'

export class TagStorageService {
  private static instance: TagStorageService

  private constructor() {}

  static getInstance(): TagStorageService {
    if (!TagStorageService.instance) {
      TagStorageService.instance = new TagStorageService()
    }
    return TagStorageService.instance
  }

  getAllTags(): string[] {
    try {
      const tags = localStorage.getItem(TAGS_KEY)
      return tags ? JSON.parse(tags) : []
    } catch {
      return []
    }
  }

  getTagUsage(): Record<string, number> {
    try {
      const usage = localStorage.getItem(TAG_USAGE_KEY)
      return usage ? JSON.parse(usage) : {}
    } catch {
      return {}
    }
  }

  addTags(tags: string[]): void {
    const existingTags = new Set(this.getAllTags())
    const usage = this.getTagUsage()
    
    tags.forEach(tag => {
      existingTags.add(tag)
      usage[tag] = (usage[tag] || 0) + 1
    })
    
    this.saveTags(Array.from(existingTags))
    this.saveUsage(usage)
  }

  removeTags(tags: string[]): void {
    const usage = this.getTagUsage()
    
    tags.forEach(tag => {
      if (usage[tag]) {
        usage[tag]--
        if (usage[tag] <= 0) {
          delete usage[tag]
        }
      }
    })
    
    // Update the main tags list based on usage
    const activeTags = Object.keys(usage)
    this.saveTags(activeTags)
    this.saveUsage(usage)
  }

  updateTagsFromDocuments(documents: Array<{ tags: string[] }>): void {
    const tagCounts: Record<string, number> = {}
    
    documents.forEach(doc => {
      doc.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      })
    })
    
    this.saveTags(Object.keys(tagCounts))
    this.saveUsage(tagCounts)
  }

  getTagsSortedByUsage(): string[] {
    const usage = this.getTagUsage()
    return Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
  }

  private saveTags(tags: string[]): void {
    try {
      localStorage.setItem(TAGS_KEY, JSON.stringify(tags.sort()))
    } catch (e) {
      console.error('Failed to save tags to localStorage:', e)
    }
  }

  private saveUsage(usage: Record<string, number>): void {
    try {
      localStorage.setItem(TAG_USAGE_KEY, JSON.stringify(usage))
    } catch (e) {
      console.error('Failed to save tag usage to localStorage:', e)
    }
  }

  clearAll(): void {
    localStorage.removeItem(TAGS_KEY)
    localStorage.removeItem(TAG_USAGE_KEY)
  }
}

export const tagStorage = TagStorageService.getInstance()