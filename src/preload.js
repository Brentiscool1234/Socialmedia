'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:save', partial),
  pickImages: (multi) => ipcRenderer.invoke('files:pickImages', { multi }),
  chat: (messages) => ipcRenderer.invoke('ai:chat', { messages }),
  generate: (opts) => ipcRenderer.invoke('ai:generate', opts),
  saveImage: (dataUrl) => ipcRenderer.invoke('files:saveImage', { dataUrl })
});
