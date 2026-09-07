/**
 * Action Registry for Nova Browser
 * Defines available actions, schema rules, and risk classification.
 */

const ACTION_TYPES = {
  // Navigation
  NAVIGATE: 'navigate',
  OPEN_URL: 'open_url',
  GO_BACK: 'go_back',
  GO_FORWARD: 'go_forward',
  RELOAD: 'reload',
  NEW_TAB: 'new_tab',
  CLOSE_TAB: 'close_tab',
  SWITCH_TAB: 'switch_tab',

  // Webpage interaction
  CLICK: 'click',
  TYPE: 'type',
  CLEAR_INPUT: 'clear_input',
  SELECT: 'select',
  SCROLL: 'scroll',
  PRESS_KEY: 'press_key',
  HOVER: 'hover',
  WAIT: 'wait',
  READ_PAGE: 'read_page',
  FIND_TEXT: 'find_text',

  // Media
  PLAY: 'play',
  PAUSE: 'pause',
  MUTE: 'mute',
  UNMUTE: 'unmute',

  // Computer & System OS actions
  SYSTEM_POWER: 'system_power',
  OPEN_FILE: 'open_file',
  OPEN_APPLICATION: 'open_application',
  OPEN_FOLDER: 'open_folder',
  SYSTEM_VOLUME: 'system_volume'
};

const HIGH_IMPACT_ACTIONS = new Set([
  'submit_form',
  'send_email',
  'send_message',
  'purchase',
  'delete_file',
  'shutdown',
  'restart'
]);

class ActionRegistry {
  /**
   * Validates action object against schema
   * @param {Object} action 
   * @returns {{ valid: boolean, error?: string }}
   */
  static validate(action) {
    if (!action || typeof action !== 'object') {
      return { valid: false, error: 'Action must be an object' };
    }

    const type = action.action;
    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'Missing action type' };
    }

    const validTypes = Object.values(ACTION_TYPES);
    if (!validTypes.includes(type)) {
      return { valid: false, error: `Unknown action type: "${type}"` };
    }

    // Specific parameter checks
    if (type === ACTION_TYPES.NAVIGATE || type === ACTION_TYPES.OPEN_URL) {
      if (!action.url || typeof action.url !== 'string') {
        return { valid: false, error: 'Navigate action requires a valid "url" string' };
      }
    }

    if (type === ACTION_TYPES.TYPE) {
      if (typeof action.text !== 'string') {
        return { valid: false, error: 'Type action requires a "text" string' };
      }
    }

    if (type === ACTION_TYPES.OPEN_APPLICATION) {
      if (!action.appName || typeof action.appName !== 'string') {
        return { valid: false, error: 'open_application requires "appName"' };
      }
    }

    if (type === ACTION_TYPES.OPEN_FILE) {
      if (!action.target && !action.filePath && !action.fileName) {
        return { valid: false, error: 'open_file requires a "target", "filePath", or "fileName"' };
      }
    }

    if (type === ACTION_TYPES.OPEN_FOLDER) {
      if (!action.folderName || typeof action.folderName !== 'string') {
        return { valid: false, error: 'open_folder requires "folderName"' };
      }
    }

    if (type === ACTION_TYPES.SYSTEM_POWER) {
      if (!action.mode || typeof action.mode !== 'string') {
        return { valid: false, error: 'system_power requires a "mode" (shutdown, restart, sleep, lock)' };
      }
    }

    return { valid: true };
  }

  /**
   * Determines if action requires user confirmation
   * @param {Object} action 
   * @returns {boolean}
   */
  static requiresConfirmation(action) {
    if (!action) return false;
    if (action.requiresConfirmation) return true;
    return HIGH_IMPACT_ACTIONS.has(action.action);
  }
}

module.exports = {
  ACTION_TYPES,
  ActionRegistry
};
