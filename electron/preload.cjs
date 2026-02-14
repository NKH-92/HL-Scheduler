const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hlScheduler', {
  versions: process.versions,
  saveImage: (payload) => ipcRenderer.invoke('scheduler:save-image', payload),
  getZoomFactor: () => ipcRenderer.invoke('scheduler:get-zoom-factor'),
  setZoomFactor: (zoomFactor) => ipcRenderer.invoke('scheduler:set-zoom-factor', { zoomFactor }),
  sendUpdateEmail: (payload) => ipcRenderer.invoke('scheduler:send-update-email', payload),
});
