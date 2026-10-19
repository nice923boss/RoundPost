// Exposes a narrow, typed API to the pages. Runs sandboxed, so it may only use electron's renderer modules.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ElectronAPI } from '../shared/api.ts'
import type { SyncEvent } from '../shared/types.ts'

const electronAPI: ElectronAPI = {
  getPosts: (filters) => ipcRenderer.invoke('posts:getAll', filters),
  getPost: (id) => ipcRenderer.invoke('posts:getById', id),
  createPost: (input) => ipcRenderer.invoke('posts:create', input),
  updatePost: (id, changes) => ipcRenderer.invoke('posts:update', id, changes),
  deletePost: (id) => ipcRenderer.invoke('posts:delete', id),
  searchPosts: (query, filters) => ipcRenderer.invoke('posts:search', query, filters),
  markPublishedByDate: (date) => ipcRenderer.invoke('posts:markPublishedByDate', date),

  togglePublished: (postPlatformId) => ipcRenderer.invoke('postPlatforms:togglePublished', postPlatformId),
  addPlatformToPost: (postId, platformId) => ipcRenderer.invoke('postPlatforms:add', postId, platformId),
  removePlatformFromPost: (postId, platformId) => ipcRenderer.invoke('postPlatforms:remove', postId, platformId),

  getPlatforms: () => ipcRenderer.invoke('platforms:getAll'),
  createPlatform: (input) => ipcRenderer.invoke('platforms:create', input),
  updatePlatform: (id, changes) => ipcRenderer.invoke('platforms:update', id, changes),
  deletePlatform: (id) => ipcRenderer.invoke('platforms:delete', id),

  copyPost: (postId) => ipcRenderer.invoke('clipboard:copy', postId),
  openPlatformUrl: (platformId) => ipcRenderer.invoke('shell:openUrl', platformId),

  getProjects: () => ipcRenderer.invoke('projects:getAll'),
  getActiveProject: () => ipcRenderer.invoke('projects:getActive'),
  createProject: (name) => ipcRenderer.invoke('projects:create', name),
  switchProject: (id) => ipcRenderer.invoke('projects:switch', id),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),

  chooseSyncFolder: () => ipcRenderer.invoke('sync:chooseFolder'),
  clearSyncFolder: () => ipcRenderer.invoke('sync:clearFolder'),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  onSyncEvent: (callback) => {
    const listener = (_event: IpcRendererEvent, data: SyncEvent) => callback(data)
    ipcRenderer.on('sync:event', listener)
    return () => {
      ipcRenderer.removeListener('sync:event', listener)
    }
  },

  chooseImportFile: () => ipcRenderer.invoke('import:choose'),
  runImport: (mapping) => ipcRenderer.invoke('import:run', mapping),

  getTemplates: () => ipcRenderer.invoke('templates:getAll'),
  createTemplate: (input) => ipcRenderer.invoke('templates:create', input),
  updateTemplate: (id, changes) => ipcRenderer.invoke('templates:update', id, changes),
  deleteTemplate: (id) => ipcRenderer.invoke('templates:delete', id),

  getTheme: () => ipcRenderer.invoke('settings:getTheme'),
  setTheme: (theme) => ipcRenderer.invoke('settings:setTheme', theme),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openLogFolder: () => ipcRenderer.invoke('app:openLogFolder'),
  logError: (message, detail) => ipcRenderer.invoke('log:renderer', message, detail),
  onFlushRequest: (flush) => {
    const listener = () => {
      flush().then(
        (ok) => ipcRenderer.send('app:flushDone', ok),
        () => ipcRenderer.send('app:flushDone', false)
      )
    }
    ipcRenderer.on('app:flushRequest', listener)
    return () => {
      ipcRenderer.removeListener('app:flushRequest', listener)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
