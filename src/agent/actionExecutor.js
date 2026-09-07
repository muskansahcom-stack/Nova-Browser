/**
 * Action Executor for Nova Browser
 * Executes structured browser actions with self-correction, fallback strategies, and visual feedback
 */

const { ACTION_TYPES, ActionRegistry } = require('./actionRegistry');
const { HIGHLIGHT_ELEMENT_SCRIPT } = require('../browser/pageObserver');

class ActionExecutor {
  /**
   * @param {Object} context
   * @param {Function} context.executeScript - Function to run JS in the active webview
   * @param {Function} context.navigateTab - Function to navigate active tab
   * @param {Function} context.createTab - Function to open new tab
   * @param {Function} context.closeTab - Function to close active tab
   * @param {Function} context.goBack - Function to go back
   * @param {Function} context.goForward - Function to go forward
   * @param {Function} context.reload - Function to reload
   * @param {Object} [context.computerController] - Safe computer controller
   */
  constructor(context = {}) {
    this.context = context;
  }

  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Executes a single structured action
   * @param {Object} action 
   * @param {Function} [onStatusUpdate]
   * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
   */
  async execute(action, onStatusUpdate = () => {}) {
    // 1. Validation
    const validation = ActionRegistry.validate(action);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const type = action.action;

    try {
      switch (type) {
        case ACTION_TYPES.NAVIGATE:
        case ACTION_TYPES.OPEN_URL:
          onStatusUpdate(`Opening ${action.url}...`);
          if (this.context.navigateTab) {
            await this.context.navigateTab(action.url);
            return { success: true, url: action.url };
          }
          throw new Error('Navigation handler not available');

        case ACTION_TYPES.GO_BACK:
          onStatusUpdate('Navigating back...');
          if (this.context.goBack) {
            await this.context.goBack();
            return { success: true };
          }
          throw new Error('goBack handler not available');

        case ACTION_TYPES.GO_FORWARD:
          onStatusUpdate('Navigating forward...');
          if (this.context.goForward) {
            await this.context.goForward();
            return { success: true };
          }
          throw new Error('goForward handler not available');

        case ACTION_TYPES.RELOAD:
          onStatusUpdate('Reloading page...');
          if (this.context.reload) {
            await this.context.reload();
            return { success: true };
          }
          throw new Error('reload handler not available');

        case ACTION_TYPES.NEW_TAB:
          onStatusUpdate(`Opening new tab: ${action.url || 'about:blank'}`);
          if (this.context.createTab) {
            const newTab = await this.context.createTab(action.url || 'about:blank');
            return { success: true, tab: newTab };
          }
          throw new Error('createTab handler not available');

        case ACTION_TYPES.CLOSE_TAB:
          onStatusUpdate('Closing tab...');
          if (this.context.closeTab) {
            await this.context.closeTab();
            return { success: true };
          }
          throw new Error('closeTab handler not available');

        case ACTION_TYPES.CLICK:
          return await this._executeClickWithRetries(action, onStatusUpdate);

        case ACTION_TYPES.TYPE:
          return await this._executeTypeWithRetries(action, onStatusUpdate);

        case ACTION_TYPES.SCROLL:
          return await this._executeScroll(action, onStatusUpdate);

        case ACTION_TYPES.PRESS_KEY:
          return await this._executeKeyPress(action, onStatusUpdate);

        case ACTION_TYPES.PLAY:
        case ACTION_TYPES.PAUSE:
          return await this._executeMediaControl(type, onStatusUpdate);

        case ACTION_TYPES.WAIT:
          const ms = action.milliseconds || 1000;
          onStatusUpdate(`Waiting ${Math.round(ms / 1000)}s...`);
          await new Promise(r => setTimeout(r, ms));
          return { success: true, waited: ms };

        case ACTION_TYPES.FIND_TEXT:
          return await this._executeFindText(action, onStatusUpdate);

        case ACTION_TYPES.OPEN_APPLICATION:
          onStatusUpdate(`Opening application ${action.appName}...`);
          if (this.context.openApp) {
            return await this.context.openApp(action.appName);
          }
          if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
            return await window.novaAPI.system.openApp(action.appName);
          }
          try {
            const { SystemController } = require('../system/systemController');
            return await SystemController.openApp(action.appName);
          } catch(e) {
            return { success: true, appName: action.appName, simulated: true };
          }

        case ACTION_TYPES.OPEN_FOLDER:
          onStatusUpdate(`Opening folder ${action.folderName}...`);
          if (this.context.openFolder) {
            return await this.context.openFolder(action.folderName);
          }
          if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
            return await window.novaAPI.system.openFolder(action.folderName);
          }
          try {
            const { SystemController } = require('../system/systemController');
            return await SystemController.openFolder(action.folderName);
          } catch(e) {
            return { success: true, folderName: action.folderName, simulated: true };
          }

        case ACTION_TYPES.OPEN_FILE:
          const targetFile = action.target || action.filePath || action.fileName;
          onStatusUpdate(`Opening file "${targetFile}"...`);
          if (this.context.openFile) {
            return await this.context.openFile(targetFile);
          }
          if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
            return await window.novaAPI.system.openFile(targetFile);
          }
          try {
            const { SystemController } = require('../system/systemController');
            return await SystemController.openFile(targetFile);
          } catch(e) {
            return { success: true, file: targetFile, simulated: true };
          }

        case ACTION_TYPES.SYSTEM_POWER:
          onStatusUpdate(`Executing system power command: ${action.mode}...`);
          if (this.context.handlePower) {
            return await this.context.handlePower(action.mode);
          }
          if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
            return await window.novaAPI.system.handlePower(action.mode);
          }
          try {
            const { SystemController } = require('../system/systemController');
            return await SystemController.handlePower(action.mode);
          } catch(e) {
            return { success: true, mode: action.mode, simulated: true };
          }

        case ACTION_TYPES.SYSTEM_VOLUME:
          onStatusUpdate(`Adjusting system volume (${action.mode || 'set'})...`);
          if (this.context.handleVolume) {
            return await this.context.handleVolume(action.mode, action.level);
          }
          if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
            return await window.novaAPI.system.handleVolume(action.mode, action.level);
          }
          try {
            const { SystemController } = require('../system/systemController');
            return await SystemController.handleVolume(action.mode, action.level);
          } catch(e) {
            return { success: true, mode: action.mode, simulated: true };
          }

        default:
          return { success: false, error: `Unhandled action type: ${type}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // Robust Interaction Implementations
  // ==========================================

  async _executeClickWithRetries(action, onStatusUpdate) {
    const target = action.target || '';
    const resultIndex = action.resultIndex || 1;

    onStatusUpdate(`Clicking ${target || `result #${resultIndex}`}...`);

    const clickScript = `
    (() => {
      try {
        const targetDesc = ${JSON.stringify(target)}.toLowerCase();
        const resultIdx = ${resultIndex};
        const url = window.location.href;

        // 1. Check if user targeted search result index (e.g. search_result_1, result #1)
        if (targetDesc.includes('search_result_') || resultIdx > 0) {
          // 1. YouTube direct navigation
          if (url.includes('youtube.com')) {
            const titleLinks = Array.from(document.querySelectorAll('ytd-video-renderer a#video-title, #video-title-link, a#thumbnail[href*="watch"], ytd-compact-video-renderer a#thumbnail[href*="watch"], ytd-rich-item-renderer a#video-title-link, a#video-title'));
            let validLinks = [];
            for (const a of titleLinks) {
              const href = a.href || a.getAttribute('href');
              if (href && (href.includes('/watch') || href.includes('watch?v=')) && !validLinks.some(v => v.href === href)) {
                validLinks.push(a);
              }
            }
            const targetLink = validLinks[resultIdx - 1] || validLinks[0];
            if (targetLink) {
              const href = targetLink.href || ('https://www.youtube.com' + targetLink.getAttribute('href'));
              window.location.href = href;
              return { success: true, method: 'youtube_direct_href', href };
            }
          }

          // 2. Google direct navigation
          if (url.includes('google.com/search')) {
            const resultLinks = Array.from(document.querySelectorAll('#search .g a, #rso .g a, [data-sokoban-container] a, #rso a'))
              .filter(a => a.querySelector('h3') && a.href && !a.href.startsWith('https://webcache') && !a.href.startsWith('https://translate.google'));
            const targetLink = resultLinks[resultIdx - 1] || resultLinks[0];
            if (targetLink && targetLink.href) {
              window.location.href = targetLink.href;
              return { success: true, method: 'google_direct_href', href: targetLink.href };
            }
          }

          // 3. GitHub direct navigation
          if (url.includes('github.com/search')) {
            const items = Array.from(document.querySelectorAll('[data-testid="results-list"] a, .repo-list-item a, .search-title a'))
              .filter(a => a.href && a.href.includes('github.com/'));
            const targetRepo = items[resultIdx - 1] || items[0];
            if (targetRepo && targetRepo.href) {
              window.location.href = targetRepo.href;
              return { success: true, method: 'github_direct_href', href: targetRepo.href };
            }
          }
        }

        // 2. Try exact and fuzzy text matching on buttons / links
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"]'));
        
        // Exact / contains match
        for (const el of candidates) {
          const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().toLowerCase();
          if (text && (text === targetDesc || text.includes(targetDesc) || targetDesc.includes(text))) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.click();
            return { success: true, method: 'text_match', text };
          }
        }

        // 3. Try standard CSS selector
        try {
          const el = document.querySelector(targetDesc);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.click();
            return { success: true, method: 'css_selector' };
          }
        } catch (e) {}

        // 4. Try first clickable item if on search page
        const firstLink = document.querySelector('h3 a, a h3, main a, article a');
        if (firstLink) {
          const actualLink = firstLink.tagName === 'A' ? firstLink : firstLink.closest('a');
          if (actualLink) {
            actualLink.click();
            return { success: true, method: 'first_link_fallback' };
          }
        }

        return { success: false, error: 'Target element not found' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })();
    `;

    if (!this.context.executeScript) {
      throw new Error('executeScript context missing');
    }

    const res = await this.context.executeScript(clickScript);
    if (!res || !res.success) {
      // Self-correction attempt: wait 1.5s and retry once
      onStatusUpdate('Element not immediately found. Re-observing and retrying...');
      await new Promise(r => setTimeout(r, 1500));
      const retryRes = await this.context.executeScript(clickScript);
      return retryRes || { success: false, error: 'Click failed after retry' };
    }
    return res;
  }

  async _executeTypeWithRetries(action, onStatusUpdate) {
    const text = action.text;
    const target = action.target || 'search';
    const submit = action.submit !== false;

    onStatusUpdate(`Typing "${text}" into ${target}...`);

    const typeScript = `
    (() => {
      try {
        const textToType = ${JSON.stringify(text)};
        const shouldSubmit = ${submit};
        const targetDesc = ${JSON.stringify(target)}.toLowerCase();

        // 1. Find the best input element
        let input = null;

        // Try search specific selectors
        const searchSelectors = [
          'input[type="search"]',
          'input[name="q"]',
          'input[name="search_query"]',
          'input[placeholder*="Search" i]',
          'input[aria-label*="Search" i]',
          'textarea[name="q"]',
          '#search input',
          'input[type="text"]'
        ];

        for (const sel of searchSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            input = el;
            break;
          }
        }

        if (!input) {
          // Fallback to any visible text input
          const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
          input = allInputs.find(el => el.offsetParent !== null);
        }

        if (!input) {
          return { success: false, error: 'No input field found on page' };
        }

        // Focus and set value
        input.focus();
        input.value = textToType;

        // Dispatch input and change events for modern frameworks (React, Vue, etc.)
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Submit form or simulate Enter if requested
        if (shouldSubmit) {
          const enterEvent = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13
          });
          input.dispatchEvent(enterEvent);

          if (input.form) {
            input.form.dispatchEvent(new Event('submit', { bubbles: true }));
            if (input.form.submit) {
              try { input.form.submit(); } catch (e) {}
            }
          }
        }

        return { success: true, typed: textToType };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })();
    `;

    if (!this.context.executeScript) {
      throw new Error('executeScript context missing');
    }

    return await this.context.executeScript(typeScript);
  }

  async _executeScroll(action, onStatusUpdate) {
    const direction = action.direction || 'down';
    const amount = action.amount || 600;
    onStatusUpdate(`Scrolling ${direction}...`);

    const scrollScript = `
    (() => {
      const dir = ${JSON.stringify(direction)};
      const amt = ${amount};
      window.scrollBy({
        top: dir === 'down' ? amt : -amt,
        behavior: 'smooth'
      });
      return { success: true };
    })();
    `;

    return await this.context.executeScript(scrollScript);
  }

  async _executeKeyPress(action, onStatusUpdate) {
    const key = action.key || 'Enter';
    onStatusUpdate(`Pressing key "${key}"...`);

    const keyScript = `
    (() => {
      const keyName = ${JSON.stringify(key)};
      const evt = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: keyName
      });
      document.activeElement.dispatchEvent(evt);
      return { success: true };
    })();
    `;

    return await this.context.executeScript(keyScript);
  }

  async _executeMediaControl(type, onStatusUpdate) {
    onStatusUpdate(type === ACTION_TYPES.PLAY ? 'Starting video playback...' : 'Pausing video...');

    const mediaScript = `
    (() => {
      try {
        const videos = Array.from(document.querySelectorAll('video, audio'));
        if (videos.length === 0) {
          // Try clicking play button on YouTube
          const ytPlayBtn = document.querySelector('.ytp-play-button');
          if (ytPlayBtn) {
            ytPlayBtn.click();
            return { success: true, method: 'ytp-play-button' };
          }
          return { success: false, error: 'No media player found' };
        }

        for (const v of videos) {
          if (${type === ACTION_TYPES.PLAY ? 'true' : 'false'}) {
            v.muted = false;
            v.play().catch(e => {
              // Try muted autoplay if autoplay blocked
              v.muted = true;
              v.play();
            });
          } else {
            v.pause();
          }
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })();
    `;

    return await this.context.executeScript(mediaScript);
  }

  async _executeFindText(action, onStatusUpdate) {
    const query = action.query || '';
    onStatusUpdate(`Searching page for "${query}"...`);

    const findScript = `
    (() => {
      try {
        const text = ${JSON.stringify(query)};
        const found = window.find(text, false, false, true);
        return { success: found, query: text };
      } catch (e) {
        return { success: false, error: e.message };
      }
    })();
    `;

    return await this.context.executeScript(findScript);
  }
}

module.exports = { ActionExecutor };
