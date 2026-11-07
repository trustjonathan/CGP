const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  refreshApp: () => ipcRenderer.invoke('refresh-app'),
  saveCourseDocument: (fileName, data) => ipcRenderer.invoke('save-course-document', fileName, data),
  openCourseDocument: (filePath) => ipcRenderer.invoke('open-course-document', filePath),
  deleteCourseDocument: (filePath) => ipcRenderer.invoke('delete-course-document', filePath),
});

contextBridge.exposeInMainWorld('multiVaultAPI', {
  saveVault: (data) => ipcRenderer.invoke('vault:save-multi', data),
  loadVault: () => ipcRenderer.invoke('vault:load-multi'),
  saveBackupSecret: (userId, secret) => ipcRenderer.invoke('vault:save-backup-secret', userId, secret),
  loadBackupSecret: (userId) => ipcRenderer.invoke('vault:load-backup-secret', userId),
  clearBackupSecret: (userId) => ipcRenderer.invoke('vault:clear-backup-secret', userId),
  copyToClipboard: (text, autoClearSec) => ipcRenderer.invoke('vault:copy-sensitive', text, autoClearSec),
});