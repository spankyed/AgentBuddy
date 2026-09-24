import { computed } from 'vue'
import { untypedOpenPlugin } from '@abuddy/sdk/fe'
import { resolveName } from '@abuddy/sdk/ids'

const HOST_SETTINGS = resolveName('settings', 'host')
import { updateSettings, useSettingsSection } from '@abuddy/sdk/fe'
import type { GeneralSettings } from '@/app-settings/types'
export interface Project {
  name: string
  directories: string[]
  color: string
}

export function useProjectActions() {
  const general = useSettingsSection<GeneralSettings>('general')
  const stored = computed(() => general.value?.projects ?? [])
  const projects = computed(() => stored.value ?? [])

  // Helper to check if a directory is in a project
  const isDirectoryInProject = (projectDirectories: string[], directoryPath: string) => {
    return projectDirectories.includes(directoryPath)
  }

  // Check if directory already exists across all projects
  const checkDuplicateDirectory = (directoryPath: string): boolean => {
    const allDirectories = projects.value.flatMap((p: Project) => p.directories || [])
    return allDirectories.includes(directoryPath)
  }

  // Helper to get all projects
  const allProjects = computed(() => {
    return projects.value.map((project: Project, pIndex: number) => ({
      project,
      pIndex
    }))
  })

  // Toggle directory in project
  const toggleDirectoryInProject = (directoryPath: string, pIndex: number) => {
    const updatedProjects = JSON.parse(JSON.stringify(projects.value)) as Project[]
    const project = updatedProjects[pIndex]

    const dirIndex = project.directories.indexOf(directoryPath)
    if (dirIndex > -1) {
      // Remove directory
      project.directories.splice(dirIndex, 1)
    } else {
      // Add directory
      project.directories.push(directoryPath)
    }

    // Update settings
    updateSettings({ section: 'general' }, ['projects'], updatedProjects)
  }

  // Remove directory from project (and delete project if it's the last directory)
  const removeDirectoryFromProject = (directoryPath: string, pIndex: number) => {
    const updatedProjects = JSON.parse(JSON.stringify(projects.value)) as Project[]
    const project = updatedProjects[pIndex]

    // Remove directory from project
    const dirIndex = project.directories.indexOf(directoryPath)
    if (dirIndex > -1) {
      project.directories.splice(dirIndex, 1)
    }

    // If project has no more directories, remove the entire project
    if (project.directories.length === 0) {
      updatedProjects.splice(pIndex, 1)
    }

    // Update settings
    updateSettings({ section: 'general' }, ['projects'], updatedProjects)
  }

  // Add directory to existing project
  const addDirectoryToProject = (directoryPath: string, pIndex: number) => {
    const updatedProjects = JSON.parse(JSON.stringify(projects.value)) as Project[]
    const project = updatedProjects[pIndex]

    // Ensure directories array exists
    if (!project.directories) {
      project.directories = []
    }

    // Add directory to project
    project.directories.push(directoryPath)

    // Update settings
    updateSettings({ section: 'general' }, ['projects'], updatedProjects)
  }

  // Create new project with directory
  const createProject = (directoryPath: string) => {
    const updatedProjects = JSON.parse(JSON.stringify(projects.value)) as Project[]

    // Extract folder name from path
    const folderName = directoryPath.split('/').filter(Boolean).pop() || 'New Project'

    // Available colors for projects
    const projectColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6']
    const randomColor = projectColors[Math.floor(Math.random() * projectColors.length)]

    // Create new project
    const newProject: Project = {
      name: folderName,
      directories: [directoryPath],
      color: randomColor
    }

    updatedProjects.push(newProject)

    // Update settings
    updateSettings({ section: 'general' }, ['projects'], updatedProjects)
  }

  // Navigate to projects settings
  const navigateToProjects = () => {
    untypedOpenPlugin(HOST_SETTINGS, [
      { type: 'TAB.SELECT', tab: 'general' },
      { type: 'GENERAL_NAV.SELECT', item: 'projects' }
    ])
  }

  return {
    projects,
    allProjects,
    isDirectoryInProject,
    checkDuplicateDirectory,
    toggleDirectoryInProject,
    removeDirectoryFromProject,
    addDirectoryToProject,
    createProject,
    navigateToProjects
  }
}
