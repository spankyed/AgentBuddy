import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'

export interface WorkspaceProject {
  name: string
  directories: string[]
  color: string
}

export interface Workspace {
  name: string
  description?: string
  directory?: string
  color: string
  projects: WorkspaceProject[]
}

export function useWorkspaceActions() {
  // Access settings for workspaces
  const settingsActor = applicationState.system.get('settings')
  const workspaces = useSelector(settingsActor, (state: any) =>
    state.context.settings?.general?.workspaces?.workspaces || []
  )

  // Helper to check if a directory is in a project
  const isDirectoryInProject = (projectDirectories: string[], directoryPath: string) => {
    return projectDirectories.includes(directoryPath)
  }

  // Helper to get all projects across all workspaces
  const allProjects = computed(() => {
    const projects: Array<{ workspace: Workspace; project: WorkspaceProject; wsIndex: number; pIndex: number }> = []
    workspaces.value.forEach((ws: Workspace, wsIndex: number) => {
      ws.projects.forEach((project: WorkspaceProject, pIndex: number) => {
        projects.push({ workspace: ws, project, wsIndex, pIndex })
      })
    })
    return projects
  })

  // Toggle directory in project
  const toggleDirectoryInProject = (directoryPath: string, wsIndex: number, pIndex: number) => {
    const updatedWorkspaces = JSON.parse(JSON.stringify(workspaces.value)) as Workspace[]
    const project = updatedWorkspaces[wsIndex].projects[pIndex]

    const dirIndex = project.directories.indexOf(directoryPath)
    if (dirIndex > -1) {
      // Remove directory
      project.directories.splice(dirIndex, 1)
    } else {
      // Add directory
      project.directories.push(directoryPath)
    }

    // Update settings
    settingsActor?.send({
      type: 'SETTINGS.UPDATE',
      entityType: 'general',
      label: 'workspaces',
      path: ['workspaces'],
      value: updatedWorkspaces
    })
  }

  // Remove directory from project (and delete project if it's the last directory)
  const removeDirectoryFromProject = (directoryPath: string, wsIndex: number, pIndex: number) => {
    const updatedWorkspaces = JSON.parse(JSON.stringify(workspaces.value)) as Workspace[]
    const project = updatedWorkspaces[wsIndex].projects[pIndex]

    // Remove directory from project
    const dirIndex = project.directories.indexOf(directoryPath)
    if (dirIndex > -1) {
      project.directories.splice(dirIndex, 1)
    }

    // If project has no more directories, remove the entire project
    if (project.directories.length === 0) {
      updatedWorkspaces[wsIndex].projects.splice(pIndex, 1)
    }

    // Update settings
    settingsActor?.send({
      type: 'SETTINGS.UPDATE',
      entityType: 'general',
      label: 'workspaces',
      path: ['workspaces'],
      value: updatedWorkspaces
    })
  }

  // Create new workspace project with directory
  const createWorkspaceProject = (directoryPath: string, wsIndex: number) => {
    const updatedWorkspaces = JSON.parse(JSON.stringify(workspaces.value)) as Workspace[]

    // Extract folder name from path
    const folderName = directoryPath.split('/').filter(Boolean).pop() || 'New Project'

    // Available colors for projects
    const projectColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6']
    const randomColor = projectColors[Math.floor(Math.random() * projectColors.length)]

    // Create new project
    const newProject: WorkspaceProject = {
      name: folderName,
      directories: [directoryPath],
      color: randomColor
    }

    // Add to existing workspace
    updatedWorkspaces[wsIndex].projects.push(newProject)

    // Update settings
    settingsActor?.send({
      type: 'SETTINGS.UPDATE',
      entityType: 'general',
      label: 'workspaces',
      path: ['workspaces'],
      value: updatedWorkspaces
    })
  }

  // Navigate to workspaces settings
  const navigateToWorkspaces = () => {
    // Switch to settings plugin
    applicationState.send({
      type: 'SELECT_PLUGIN',
      pluginId: 'settings'
    })

    // Navigate to General tab
    settingsActor?.send({
      type: 'SETTINGS_TAB.SELECT',
      tab: 'general'
    })

    // Navigate to Workspaces section
    settingsActor?.send({
      type: 'GENERAL_NAV.SELECT',
      item: 'workspaces'
    })
  }

  return {
    workspaces,
    allProjects,
    isDirectoryInProject,
    toggleDirectoryInProject,
    removeDirectoryFromProject,
    createWorkspaceProject,
    navigateToWorkspaces
  }
}
