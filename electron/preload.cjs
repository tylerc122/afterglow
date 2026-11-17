// The only bridge between the page and the Mac: listening history in, live plays out.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('afterglow', {
  historySummary: (force) => ipcRenderer.invoke('history:summary', !!force),
  appendLive: (rows) => ipcRenderer.invoke('history:live', rows),
})
