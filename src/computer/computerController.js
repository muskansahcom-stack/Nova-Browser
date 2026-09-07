/**
 * Safe Computer Control Framework for Nova Browser
 * Provides controlled, isolated OS-level actions without exposing raw terminal execution.
 */

const { execFile, exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const SAFE_APPLICATIONS = {
  darwin: {
    'vscode': 'Visual Studio Code',
    'visual studio code': 'Visual Studio Code',
    'code': 'Visual Studio Code',
    'terminal': 'Terminal',
    'finder': 'Finder',
    'calculator': 'Calculator',
    'notes': 'Notes',
    'settings': 'System Settings'
  },
  win32: {
    'vscode': 'code',
    'visual studio code': 'code',
    'code': 'code',
    'notepad': 'notepad.exe',
    'calculator': 'calc.exe',
    'explorer': 'explorer.exe'
  },
  linux: {
    'vscode': 'code',
    'code': 'code',
    'terminal': 'gnome-terminal',
    'calculator': 'gnome-calculator',
    'files': 'nautilus'
  }
};

const SAFE_FOLDERS = {
  'downloads': () => path.join(os.homedir(), 'Downloads'),
  'documents': () => path.join(os.homedir(), 'Documents'),
  'desktop': () => path.join(os.homedir(), 'Desktop'),
  'home': () => os.homedir(),
  'pictures': () => path.join(os.homedir(), 'Pictures')
};

class ComputerController {
  constructor() {
    this.platform = os.platform();
  }

  /**
   * Safe application launcher
   * @param {string} appName 
   */
  async openApplication(appName) {
    if (!appName || typeof appName !== 'string') {
      throw new Error('Invalid application name');
    }

    const clean = appName.trim().toLowerCase();
    const platformApps = SAFE_APPLICATIONS[this.platform] || SAFE_APPLICATIONS.darwin;
    const targetApp = platformApps[clean] || appName.trim();

    return new Promise((resolve, reject) => {
      if (this.platform === 'darwin') {
        execFile('open', ['-a', targetApp], (err) => {
          if (err) return reject(new Error(`Could not open application: ${targetApp} (${err.message})`));
          resolve({ success: true, message: `Opened ${targetApp}` });
        });
      } else if (this.platform === 'win32') {
        execFile('cmd.exe', ['/c', 'start', targetApp], (err) => {
          if (err) return reject(new Error(`Could not open application: ${targetApp} (${err.message})`));
          resolve({ success: true, message: `Opened ${targetApp}` });
        });
      } else {
        execFile('xdg-open', [targetApp], (err) => {
          if (err) return reject(new Error(`Could not open application: ${targetApp} (${err.message})`));
          resolve({ success: true, message: `Opened ${targetApp}` });
        });
      }
    });
  }

  /**
   * Safe folder opener
   * @param {string} folderName 
   */
  async openFolder(folderName) {
    const clean = folderName.trim().toLowerCase();
    let targetPath;

    if (SAFE_FOLDERS[clean]) {
      targetPath = SAFE_FOLDERS[clean]();
    } else {
      // Validate that path is inside user homedir
      const resolved = path.resolve(folderName);
      if (!resolved.startsWith(os.homedir())) {
        throw new Error('Access denied: Cannot open system-restricted folder');
      }
      targetPath = resolved;
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Folder does not exist: ${targetPath}`);
    }

    return new Promise((resolve, reject) => {
      if (this.platform === 'darwin') {
        execFile('open', [targetPath], (err) => {
          if (err) return reject(err);
          resolve({ success: true, path: targetPath, message: `Opened folder ${targetPath}` });
        });
      } else if (this.platform === 'win32') {
        execFile('explorer.exe', [targetPath], (err) => {
          if (err) return reject(err);
          resolve({ success: true, path: targetPath, message: `Opened folder ${targetPath}` });
        });
      } else {
        execFile('xdg-open', [targetPath], (err) => {
          if (err) return reject(err);
          resolve({ success: true, path: targetPath, message: `Opened folder ${targetPath}` });
        });
      }
    });
  }
}

module.exports = { ComputerController };
