import { create } from 'zustand'
import { api } from '../lib/api.ts'
import { usePlatformStore } from './platformStore.ts'
import { usePostStore } from './postStore.ts'
import type { Project } from '../../shared/types.ts'

interface ProjectState {
  projects: Project[]
  active: Project | null
  loaded: boolean
  load: () => Promise<void>
  switchTo: (id: string) => Promise<void>
  create: (name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Returns false when the folder dialog was cancelled. */
  chooseSyncFolder: () => Promise<boolean>
  clearSyncFolder: () => Promise<void>
  /** Deletes every post of the open project and turns its syncing off. Returns how many posts there were. */
  clearAllPosts: () => Promise<number>
}

// Data of the previous project must not show while the next one loads.
function forgetProjectData(): void {
  usePostStore.getState().reset()
  usePlatformStore.getState().reset()
}

// Errors are left to the caller, which knows what the user was trying to do.
export const useProjectStore = create<ProjectState>((set, get) => {
  const replaceActive = (project: Project) =>
    set((state) => ({ active: project, projects: state.projects.map((p) => (p.id === project.id ? project : p)) }))

  return {
    projects: [],
    active: null,
    loaded: false,
    load: async () => {
      const [projects, active] = await Promise.all([api.getProjects(), api.getActiveProject()])
      set({ projects, active, loaded: true })
    },
    switchTo: async (id) => {
      if (get().active?.id === id) return
      const active = await api.switchProject(id)
      forgetProjectData()
      set({ active })
    },
    create: async (name) => {
      const project = await api.createProject(name)
      forgetProjectData()
      set((state) => ({ projects: [...state.projects, project], active: project }))
    },
    remove: async (id) => {
      const active = await api.deleteProject(id)
      if (active?.id !== get().active?.id) forgetProjectData()
      // Deleting the last project creates an empty one, so the list is fetched again.
      set({ projects: await api.getProjects(), active })
    },
    chooseSyncFolder: async () => {
      const project = await api.chooseSyncFolder()
      if (!project) return false
      replaceActive(project)
      return true
    },
    clearSyncFolder: async () => replaceActive(await api.clearSyncFolder()),
    clearAllPosts: async () => {
      const id = get().active?.id
      if (!id) throw new Error('尚未開啟任何專案')
      const { deleted, project } = await api.clearAllPosts(id)
      replaceActive(project)
      await usePostStore.getState().loadPosts()
      return deleted
    }
  }
})
