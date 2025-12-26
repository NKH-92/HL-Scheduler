const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('scheduler', {
  versions: process.versions,
});
