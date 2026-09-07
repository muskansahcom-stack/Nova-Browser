/**
 * System & OS Controller for Nova Browser
 * Provides cross-platform local computer automation (macOS, Windows, Linux)
 * Includes power management, file & folder opening, application launching, and volume controls.
 */

const { exec } = require('child_process');
const { shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SystemController {
  /**
   * Execute shell command wrapped in a Promise
   */
  static runCommand(cmd) {
    return new Promise((resolve) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.warn(`[SystemController] Command "${cmd}" warning:`, err.message);
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, output: stdout.trim() });
        }
      });
    });
  }

  /**
   * Power and sleep management
   * @param {'shutdown'|'restart'|'sleep'|'lock'} mode
   */
  static async handlePower(mode) {
    const platform = process.platform;

    switch (mode) {
      case 'shutdown':
        if (platform === 'darwin') {
          return await SystemController.runCommand('osascript -e \'tell app "System Events" to shut down\'');
        } else if (platform === 'win32') {
          return await SystemController.runCommand('shutdown /s /t 0');
        } else {
          return await SystemController.runCommand('systemctl poweroff || shutdown -h now');
        }

      case 'restart':
        if (platform === 'darwin') {
          return await SystemController.runCommand('osascript -e \'tell app "System Events" to restart\'');
        } else if (platform === 'win32') {
          return await SystemController.runCommand('shutdown /r /t 0');
        } else {
          return await SystemController.runCommand('systemctl reboot || shutdown -r now');
        }

      case 'sleep':
        if (platform === 'darwin') {
          return await SystemController.runCommand('pmset displaysleepnow || osascript -e \'tell app "System Events" to sleep\'');
        } else if (platform === 'win32') {
          return await SystemController.runCommand('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
        } else {
          return await SystemController.runCommand('systemctl suspend');
        }

      case 'lock':
        if (platform === 'darwin') {
          return await SystemController.runCommand('pmset displaysleepnow');
        } else if (platform === 'win32') {
          return await SystemController.runCommand('rundll32.exe user32.dll,LockWorkStation');
        } else {
          return await SystemController.runCommand('xdg-screensaver lock || loginctl lock-session');
        }

      default:
        return { success: false, error: `Unsupported power mode: ${mode}` };
    }
  }

  /**
   * Opens an application by name
   */
  static async openApp(appName) {
    if (!appName) return { success: false, error: 'App name required' };
    const platform = process.platform;
    const cleanName = appName.trim();

    // Map common aliases
    const aliases = {
      'vs code': 'Visual Studio Code',
      'vscode': 'Visual Studio Code',
      'code': 'Visual Studio Code',
      'terminal': platform === 'darwin' ? 'Terminal' : 'cmd',
      'calc': platform === 'darwin' ? 'Calculator' : 'calc',
      'notes': platform === 'darwin' ? 'Notes' : 'notepad',
      'spotify': 'Spotify',
      'finder': 'Finder',
      'chrome': platform === 'darwin' ? 'Google Chrome' : 'chrome',
      'safari': 'Safari',
      'settings': platform === 'darwin' ? 'System Settings' : 'control'
    };

    const targetApp = aliases[cleanName.toLowerCase()] || cleanName;

    if (platform === 'darwin') {
      return await SystemController.runCommand(`open -a "${targetApp}"`);
    } else if (platform === 'win32') {
      return await SystemController.runCommand(`start "" "${targetApp}"`);
    } else {
      return await SystemController.runCommand(`gtk-launch "${targetApp}" || ${targetApp} &`);
    }
  }

  /**
   * Resolves and opens a specific file
   */
  static async openFile(targetPathOrName) {
    if (!targetPathOrName) return { success: false, error: 'File path or name required' };
    const homeDir = os.homedir();
    const candidatePath = targetPathOrName.trim();

    // 1. Direct path check
    if (fs.existsSync(candidatePath)) {
      if (shell && shell.openPath) {
        const res = await shell.openPath(candidatePath);
        return { success: !res, path: candidatePath, error: res || undefined };
      }
      return await SystemController.runCommand(`open "${candidatePath}"`);
    }

    // 2. Search common user directories (Downloads, Documents, Desktop, Home)
    const searchDirs = [
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Desktop'),
      homeDir
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      // Exact match
      const direct = path.join(dir, candidatePath);
      if (fs.existsSync(direct)) {
        if (shell && shell.openPath) {
          const res = await shell.openPath(direct);
          return { success: !res, path: direct, error: res || undefined };
        }
        return await SystemController.runCommand(`open "${direct}"`);
      }

      // Fuzzy match (case-insensitive or partial)
      try {
        const files = fs.readdirSync(dir);
        const lowerCandidate = candidatePath.toLowerCase();
        const found = files.find(f => f.toLowerCase() === lowerCandidate || f.toLowerCase().includes(lowerCandidate));
        if (found) {
          const fullPath = path.join(dir, found);
          if (shell && shell.openPath) {
            const res = await shell.openPath(fullPath);
            return { success: !res, path: fullPath, error: res || undefined };
          }
          return await SystemController.runCommand(`open "${fullPath}"`);
        }
      } catch (e) {}
    }

    return { success: false, error: `File "${candidatePath}" not found in Desktop, Downloads, or Documents` };
  }

  /**
   * Opens a folder in Finder / File Explorer
   */
  static async openFolder(folderName) {
    const homeDir = os.homedir();
    const clean = (folderName || '').trim().toLowerCase();

    const folderMap = {
      'downloads': path.join(homeDir, 'Downloads'),
      'documents': path.join(homeDir, 'Documents'),
      'desktop': path.join(homeDir, 'Desktop'),
      'pictures': path.join(homeDir, 'Pictures'),
      'music': path.join(homeDir, 'Music'),
      'home': homeDir
    };

    const targetDir = folderMap[clean] || (fs.existsSync(folderName) ? folderName : path.join(homeDir, folderName));

    if (fs.existsSync(targetDir)) {
      if (shell && shell.openPath) {
        const res = await shell.openPath(targetDir);
        return { success: !res, path: targetDir, error: res || undefined };
      }
      return await SystemController.runCommand(`open "${targetDir}"`);
    }

    return { success: false, error: `Folder "${folderName}" not found` };
  }

  /**
   * Controls system volume
   * @param {'up'|'down'|'mute'|'unmute'|'set'} mode
   * @param {number} level - 0 to 100
   */
  static async handleVolume(mode, level = 50) {
    const platform = process.platform;
    if (platform !== 'darwin') {
      return { success: true, message: 'Volume control simulated on this platform' };
    }

    switch (mode) {
      case 'mute':
        return await SystemController.runCommand('osascript -e \'set volume output muted true\'');
      case 'unmute':
        return await SystemController.runCommand('osascript -e \'set volume output muted false\'');
      case 'up':
        return await SystemController.runCommand('osascript -e \'set volume output volume ((output volume of (get volume settings)) + 15)\'');
      case 'down':
        return await SystemController.runCommand('osascript -e \'set volume output volume ((output volume of (get volume settings)) - 15)\'');
      case 'set':
        const safeLevel = Math.max(0, Math.min(100, level));
        return await SystemController.runCommand(`osascript -e 'set volume output volume ${safeLevel}'`);
      default:
        return { success: false, error: `Unknown volume mode: ${mode}` };
    }
  }
}

module.exports = { SystemController };
