/**
 * Main Electron Process for Nova Browser
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const { BrowserAgent } = require('./src/agent/browserAgent');
const { SystemController } = require('./src/system/systemController');

// Flags for media autoplay and webview optimization
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies');

let mainWindow = null;
let browserAgent = null;
let pendingPermissionResolver = null;

function createWindow() {
  // Allow all permissions (audio, media, fullscreen, etc.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  // Initialize BrowserAgent
  browserAgent = new BrowserAgent({
    aiConfig: {
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      openaiApiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.AI_MODEL || 'gemini-2.0-flash'
    },
    onRequestPermission: (req) => {
      return new Promise((resolve) => {
        pendingPermissionResolver = resolve;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:permission-request', req);
        } else {
          resolve(false);
        }
      });
    },
    onTaskEvent: (evt) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent:event', evt);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App Lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Event Handlers
ipcMain.handle('agent:send-command', async (event, command) => {
  if (!browserAgent) {
    throw new Error('Browser agent is not initialized');
  }
  return await browserAgent.executeCommand(command);
});

ipcMain.handle('agent:abort', async () => {
  if (browserAgent) {
    browserAgent.abort();
  }
  return { success: true };
});

ipcMain.handle('agent:permission-response', async (event, allowed) => {
  if (pendingPermissionResolver) {
    pendingPermissionResolver(Boolean(allowed));
    pendingPermissionResolver = null;
  }
  return { success: true };
});

ipcMain.handle('settings:get', async () => {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY ? '••••••••' : '',
    openaiApiKey: process.env.OPENAI_API_KEY ? '••••••••' : '',
    model: process.env.AI_MODEL || 'gemini-2.0-flash'
  };
});

ipcMain.handle('settings:save', async (event, settings) => {
  if (settings.geminiApiKey && !settings.geminiApiKey.includes('••••')) {
    process.env.GEMINI_API_KEY = settings.geminiApiKey;
  }
  if (settings.openaiApiKey && !settings.openaiApiKey.includes('••••')) {
    process.env.OPENAI_API_KEY = settings.openaiApiKey;
  }
  if (settings.model) {
    process.env.AI_MODEL = settings.model;
  }

  if (browserAgent) {
    browserAgent.updateConfig({
      geminiApiKey: process.env.GEMINI_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      model: process.env.AI_MODEL
    });
  }

  return { success: true };
});

// System & OS Automation Handlers
ipcMain.handle('system:power', async (event, mode) => {
  return await SystemController.handlePower(mode);
});

ipcMain.handle('system:open-file', async (event, filePath) => {
  return await SystemController.openFile(filePath);
});

ipcMain.handle('system:open-app', async (event, appName) => {
  return await SystemController.openApp(appName);
});

ipcMain.handle('system:open-folder', async (event, folderName) => {
  return await SystemController.openFolder(folderName);
});

ipcMain.handle('system:volume', async (event, { mode, level }) => {
  return await SystemController.handleVolume(mode, level);
});

// Window controls
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});
