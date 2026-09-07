/**
 * Secure Preload Script for Nova Browser
 * Strict context isolation with validated IPC bridges and helper exposure
 */

const { contextBridge, ipcRenderer } = require('electron');
const { parseOmniboxInput } = require('./src/config/websites');
const { BrowserAgent } = require('./src/agent/browserAgent');

contextBridge.exposeInMainWorld('novaAPI', {
  // Omnibox URL helper
  parseOmniboxInput: (input) => parseOmniboxInput(input),

  // Direct Agent Instance Factory for Webview Integration
  createAgent: (options) => new BrowserAgent(options),

  // AI Agent Commands
  sendCommand: (command) => ipcRenderer.invoke('agent:send-command', command),
  abortTask: () => ipcRenderer.invoke('agent:abort'),
  onAgentEvent: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('agent:event', subscription);
    return () => ipcRenderer.removeListener('agent:event', subscription);
  },

  // Permission Flow
  onPermissionRequest: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('agent:permission-request', subscription);
    return () => ipcRenderer.removeListener('agent:permission-request', subscription);
  },
  respondPermission: (allowed) => ipcRenderer.invoke('agent:permission-response', allowed),

  // Settings & Configuration
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Local Computer & System Automation
  system: {
    handlePower: (mode) => ipcRenderer.invoke('system:power', mode),
    openFile: (filePath) => ipcRenderer.invoke('system:open-file', filePath),
    openApp: (appName) => ipcRenderer.invoke('system:open-app', appName),
    openFolder: (folderName) => ipcRenderer.invoke('system:open-folder', folderName),
    handleVolume: (mode, level) => ipcRenderer.invoke('system:volume', { mode, level })
  },

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
});
