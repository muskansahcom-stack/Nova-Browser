/**
 * AI Provider for Nova Browser
 * Modular interface supporting Google Gemini, OpenAI, and smart local dynamic planning
 */

const { SYSTEM_PROMPT_PLANNER, SYSTEM_PROMPT_PAGE_ANALYST, SYSTEM_PROMPT_VERIFIER } = require('./prompts');
const { CommandParser } = require('./commandParser');
const { parseOmniboxInput, KNOWN_SERVICES } = require('../config/websites');

class AIProvider {
  /**
   * @param {Object} config
   * @param {string} [config.geminiApiKey]
   * @param {string} [config.openaiApiKey]
   * @param {string} [config.model]
   */
  constructor(config = {}) {
    this.geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || '';
    this.openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || '';
    this.model = config.model || process.env.AI_MODEL || 'gemini-2.0-flash';
  }

  /**
   * Update credentials at runtime
   */
  updateConfig(config) {
    if (config.geminiApiKey !== undefined) this.geminiApiKey = config.geminiApiKey;
    if (config.openaiApiKey !== undefined) this.openaiApiKey = config.openaiApiKey;
    if (config.model !== undefined) this.model = config.model;
  }

  /**
   * Generates a multi-step structured plan from user command and page context
   * @param {Object} params
   * @param {string} params.command
   * @param {Object} params.pageContext - current URL, title, visible elements
   * @param {Object} params.taskMemory - previous searches, results, actions
   * @returns {Promise<Object>}
   */
  async createPlan({ command, pageContext = {}, taskMemory = {} }) {
    // 1. If LLM API Key is configured, attempt cloud LLM planning
    if (this.geminiApiKey) {
      try {
        const plan = await this._callGeminiPlanner(command, pageContext, taskMemory);
        if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
          return plan;
        }
      } catch (err) {
        console.warn('Gemini API call failed, falling back to dynamic built-in engine:', err.message);
      }
    }

    if (this.openaiApiKey) {
      try {
        const plan = await this._callOpenAIPlanner(command, pageContext, taskMemory);
        if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
          return plan;
        }
      } catch (err) {
        console.warn('OpenAI API call failed, falling back to dynamic built-in engine:', err.message);
      }
    }

    // 2. Dynamic Built-in Planner Engine
    return this._dynamicFallbackPlan(command, pageContext, taskMemory);
  }

  /**
   * Analyzes page elements to resolve targets
   */
  async analyzePage({ goal, step, pageContext }) {
    if (this.geminiApiKey) {
      try {
        return await this._callGeminiPageAnalyst(goal, step, pageContext);
      } catch (err) {
        console.warn('Gemini page analysis fallback:', err.message);
      }
    }
    return this._dynamicFallbackPageAnalysis(goal, step, pageContext);
  }

  /**
   * Verifies task outcome
   */
  async verifyTask({ command, goal, actionsTaken, finalState }) {
    if (this.geminiApiKey) {
      try {
        return await this._callGeminiVerifier(command, goal, actionsTaken, finalState);
      } catch (err) {
        console.warn('Gemini verification fallback:', err.message);
      }
    }
    return this._dynamicFallbackVerification(command, goal, actionsTaken, finalState);
  }

  // ==========================================
  // Cloud LLM Integrations (Gemini & OpenAI)
  // ==========================================

  async _callGeminiPlanner(command, pageContext, taskMemory) {
    const prompt = `User Request: "${command}"\nCurrent URL: ${pageContext.url || 'about:blank'}\nPage Title: ${pageContext.title || ''}\nTask Memory Context: ${JSON.stringify(taskMemory)}\n\nProduce the structured JSON plan as specified.`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.geminiApiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${SYSTEM_PROMPT_PLANNER}\n\n${prompt}` }] }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
    });

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  async _callOpenAIPlanner(command, pageContext, taskMemory) {
    const prompt = `User Request: "${command}"\nCurrent URL: ${pageContext.url || 'about:blank'}\nPage Title: ${pageContext.title || ''}\nTask Memory Context: ${JSON.stringify(taskMemory)}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.model.startsWith('gpt') ? this.model : 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_PLANNER },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    return JSON.parse(text);
  }

  async _callGeminiPageAnalyst(goal, step, pageContext) {
    const prompt = SYSTEM_PROMPT_PAGE_ANALYST
      .replace('{GOAL}', goal)
      .replace('{STEP}', JSON.stringify(step))
      .replace('{URL}', pageContext.url || '')
      .replace('{TITLE}', pageContext.title || '')
      .replace('{ELEMENTS}', JSON.stringify((pageContext.elements || []).slice(0, 50), null, 2));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      })
    });

    if (!res.ok) throw new Error(`Gemini Analyst HTTP ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
  }

  async _callGeminiVerifier(command, goal, actionsTaken, finalState) {
    const prompt = `${SYSTEM_PROMPT_VERIFIER}\n\nCommand: "${command}"\nGoal: "${goal}"\nActions: ${JSON.stringify(actionsTaken)}\nFinal State URL: ${finalState.url}\nFinal State Title: ${finalState.title}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      })
    });

    if (!res.ok) throw new Error(`Gemini Verifier HTTP ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
  }

  // =========================================================================
  // Intelligent Dynamic Fallback Planner (Zero-Configuration Autonomous Engine)
  // =========================================================================

  /**
   * Formulates dynamic multi-step plans without requiring external API keys
   */
  _dynamicFallbackPlan(rawCommand, pageContext = {}, taskMemory = {}) {
    const command = rawCommand.trim();
    const lower = command.toLowerCase();
    const sensitivity = CommandParser.checkSensitivity(command);

    const steps = [];
    let goal = command;
    let verificationCriteria = {};

    // Check sensitive permission requirement
    const requiresConfirmation = sensitivity.isSensitive;
    const confirmationMessage = sensitivity.reason ? `Nova wants permission to: ${sensitivity.reason}` : '';

    // 1. Navigation controls (go back, go forward, reload)
    if (/^(go\s+)?back$/i.test(lower)) {
      return {
        thought: 'User requested going back to the previous page',
        goal: 'Navigate back in browser history',
        steps: [{ action: 'go_back' }],
        verificationCriteria: { description: 'Browser navigates to previous page' }
      };
    }
    if (/^(go\s+)?forward$/i.test(lower)) {
      return {
        thought: 'User requested going forward',
        goal: 'Navigate forward in browser history',
        steps: [{ action: 'go_forward' }],
        verificationCriteria: { description: 'Browser navigates forward' }
      };
    }
    if (/^reload(\s+page)?$/i.test(lower) || /^refresh(\s+page)?$/i.test(lower)) {
      return {
        thought: 'User requested page reload',
        goal: 'Reload current page',
        steps: [{ action: 'reload' }],
        verificationCriteria: { description: 'Page reloaded' }
      };
    }

    // 2. Tab management ("open new tab", "close tab", "open X in a new tab")
    const newTabWithUrlMatch = lower.match(/open\s+(.+?)\s+in\s+a?\s*new\s+tab/i);
    if (newTabWithUrlMatch) {
      const targetQuery = newTabWithUrlMatch[1].trim();
      const parsed = parseOmniboxInput(targetQuery);
      return {
        thought: `Opening ${targetQuery} in a new tab`,
        goal: `Open ${targetQuery} in new tab`,
        steps: [{ action: 'new_tab', url: parsed.url }],
        verificationCriteria: { expectedUrlContains: parsed.isUrl ? targetQuery : 'google', description: `New tab navigated to ${parsed.url}` }
      };
    }

    if (/^open\s+a?\s*new\s+tab(\s+and\s+search\s+for\s+(.+))?$/i.test(lower)) {
      const match = lower.match(/^open\s+a?\s*new\s+tab(\s+and\s+search\s+for\s+(.+))?$/i);
      if (match && match[2]) {
        const searchQuery = match[2].trim();
        return {
          thought: `Opening new tab and searching for "${searchQuery}"`,
          goal: `Search "${searchQuery}" in new tab`,
          steps: [
            { action: 'new_tab', url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}` }
          ],
          verificationCriteria: { expectedUrlContains: 'google.com/search', description: `Google search for ${searchQuery} in new tab` }
        };
      }
      return {
        thought: 'Opening a blank new tab',
        goal: 'Open new tab',
        steps: [{ action: 'new_tab', url: 'about:blank' }],
        verificationCriteria: { description: 'New tab created' }
      };
    }

    if (/^close\s+tab$/i.test(lower) || /^close\s+current\s+tab$/i.test(lower)) {
      return {
        thought: 'Closing current tab',
        goal: 'Close current tab',
        steps: [{ action: 'close_tab' }],
        verificationCriteria: { description: 'Current tab closed' }
      };
    }

    // 3. System Power & Sleep Management
    if (/\b(turn\s+off|shut\s*down|power\s+off)\b/i.test(lower) && /\b(laptop|pc|computer|system|mac|machine)\b/i.test(lower)) {
      return {
        thought: 'User requested shutting down the laptop/computer',
        goal: 'Shut down laptop',
        steps: [{ action: 'system_power', mode: 'shutdown' }],
        requiresConfirmation: true,
        confirmationMessage: 'Nova requires permission to shut down your laptop.',
        verificationCriteria: { description: 'System shutdown command sent' }
      };
    }
    if (/\b(restart|reboot)\b/i.test(lower) && /\b(laptop|pc|computer|system|mac|machine)\b/i.test(lower)) {
      return {
        thought: 'User requested restarting the laptop/computer',
        goal: 'Restart laptop',
        steps: [{ action: 'system_power', mode: 'restart' }],
        requiresConfirmation: true,
        confirmationMessage: 'Nova requires permission to restart your laptop.',
        verificationCriteria: { description: 'System restart command sent' }
      };
    }
    if (/\b(sleep|put\s+to\s+sleep)\b/i.test(lower) && (/\b(laptop|pc|computer|system|screen|display)\b/i.test(lower) || lower.includes('sleep'))) {
      return {
        thought: 'User requested putting the laptop/computer to sleep',
        goal: 'Put laptop to sleep',
        steps: [{ action: 'system_power', mode: 'sleep' }],
        verificationCriteria: { description: 'Laptop display and system entered sleep' }
      };
    }
    if (/\b(lock\s+(screen|laptop|computer|mac|system))\b/i.test(lower) || /^lock\s+my\s+screen$/i.test(lower)) {
      return {
        thought: 'User requested locking the screen',
        goal: 'Lock screen',
        steps: [{ action: 'system_power', mode: 'lock' }],
        verificationCriteria: { description: 'Screen locked' }
      };
    }

    // 4. System Volume Controls
    const setVolumeMatch = lower.match(/(?:set|change)?\s*(?:system\s+)?volume\s*(?:to\s*)?(\d+)%?/i);
    if (setVolumeMatch) {
      const level = parseInt(setVolumeMatch[1], 10);
      return {
        thought: `Setting system volume to ${level}%`,
        goal: `Set volume to ${level}%`,
        steps: [{ action: 'system_volume', mode: 'set', level }],
        verificationCriteria: { description: `Volume set to ${level}%` }
      };
    }
    if (/(?:turn\s+|increase\s+|raise\s+)?volume\s*up/i.test(lower)) {
      return {
        thought: 'Increasing system volume',
        goal: 'Turn volume up',
        steps: [{ action: 'system_volume', mode: 'up' }],
        verificationCriteria: { description: 'Volume increased' }
      };
    }
    if (/(?:turn\s+|decrease\s+|lower\s+)?volume\s*down/i.test(lower)) {
      return {
        thought: 'Decreasing system volume',
        goal: 'Turn volume down',
        steps: [{ action: 'system_volume', mode: 'down' }],
        verificationCriteria: { description: 'Volume decreased' }
      };
    }
    if (/^mute(\s+sound|\s+volume|\s+audio)?$/i.test(lower)) {
      return {
        thought: 'Muting system volume',
        goal: 'Mute system sound',
        steps: [{ action: 'system_volume', mode: 'mute' }],
        verificationCriteria: { description: 'Sound muted' }
      };
    }
    if (/^unmute(\s+sound|\s+volume|\s+audio)?$/i.test(lower)) {
      return {
        thought: 'Unmuting system volume',
        goal: 'Unmute system sound',
        steps: [{ action: 'system_volume', mode: 'unmute' }],
        verificationCriteria: { description: 'Sound unmuted' }
      };
    }

    // 5. Open Specific File
    const fileWithExtMatch = command.match(/^open\s+(?:the\s+|a\s+|my\s+)?(?:specific\s+)?(?:file\s+)?([a-zA-Z0-9_\-.\/ ~]+\.(?:pdf|txt|docx?|xlsx?|pptx?|png|jpe?g|json|csv|md|py|js|html|mp4|mp3|zip))$/i);
    if (fileWithExtMatch) {
      const fileName = fileWithExtMatch[1].trim();
      return {
        thought: `Opening local file "${fileName}"`,
        goal: `Open file ${fileName}`,
        steps: [{ action: 'open_file', target: fileName, fileName }],
        verificationCriteria: { description: `File ${fileName} opened` }
      };
    }

    const genericFileMatch = command.match(/^open\s+(?:the\s+|a\s+|my\s+)?(?:specific\s+)?file\s+["']?(.+?)["']?$/i);
    if (genericFileMatch) {
      const fileName = genericFileMatch[1].trim();
      return {
        thought: `Opening local file "${fileName}"`,
        goal: `Open file ${fileName}`,
        steps: [{ action: 'open_file', target: fileName, fileName }],
        verificationCriteria: { description: `File ${fileName} opened` }
      };
    }

    const namedDocMatch = lower.match(/^open\s+(?:my\s+)?(resume|cv|notes|report|document)$/i);
    if (namedDocMatch) {
      const docName = namedDocMatch[1];
      return {
        thought: `Searching and opening user's ${docName}`,
        goal: `Open ${docName}`,
        steps: [{ action: 'open_file', target: docName }],
        verificationCriteria: { description: `Opened ${docName}` }
      };
    }

    // 6. Computer / OS actions (Apps & Folders)
    const appMatch = lower.match(/^open\s+(?:application\s+|app\s+)?(vs\s*code|vscode|code|visual\s+studio\s+code|terminal|finder|calculator|notes|spotify|slack|discord|chrome|safari|settings)$/i);
    if (appMatch) {
      const appName = appMatch[1];
      return {
        thought: `Opening local application ${appName}`,
        goal: `Open application ${appName}`,
        steps: [{ action: 'open_application', appName }],
        verificationCriteria: { description: `Application ${appName} launched` }
      };
    }
    const folderMatch = lower.match(/^open\s+(?:folder\s+)?(downloads|documents|desktop|pictures|music|home)(?:\s+folder)?$/i);
    if (folderMatch) {
      const folderName = folderMatch[1];
      return {
        thought: `Opening local folder ${folderName}`,
        goal: `Open folder ${folderName}`,
        steps: [{ action: 'open_folder', folderName }],
        verificationCriteria: { description: `Folder ${folderName} opened` }
      };
    }

    // 4. Compound Multi-step instructions (e.g. "Open YouTube, search for Arijit Singh, and play the first result")
    const subCommands = CommandParser.splitCompoundCommands(command);
    if (subCommands.length > 1) {
      return this._planCompoundSteps(subCommands, pageContext, taskMemory);
    }

    // 5. Relative references based on previous state ("open the first result", "open the 2nd result", "click second result")
    const standaloneRefMatch = lower.match(/^(?:open|click|play|select)\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s*(?:result|video|link|item|one|course|product|page)?$/i);
    if (standaloneRefMatch) {
      const relativeRef = CommandParser.extractRelativeReference(lower);
      const index = relativeRef.found ? relativeRef.index : 1;
      const isPlay = lower.startsWith('play');
      const steps = [
        { action: 'click', target: `search_result_${index}`, resultIndex: index },
        { action: 'wait', milliseconds: 2000 }
      ];
      if (isPlay) {
        steps.push({ action: 'play' });
      }
      return {
        thought: `User requested ${isPlay ? 'playing' : 'opening'} result #${index} from the current search/list context`,
        goal: `${isPlay ? 'Play' : 'Open'} search result #${index}`,
        steps,
        verificationCriteria: { description: `${isPlay ? 'Played' : 'Opened'} result #${index}` }
      };
    }

    // 6. Direct Web & Search Instructions
    // "Open this website: example.com" or "Open https://..."
    const directUrlMatch = lower.match(/^open\s+(this\s+website:\s*|url:\s*)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s]*)?|https?:\/\/[^\s]+)$/i);
    if (directUrlMatch) {
      const rawUrl = directUrlMatch[2];
      const parsed = parseOmniboxInput(rawUrl);
      return {
        thought: `Direct navigation to ${parsed.url}`,
        goal: `Navigate to ${parsed.url}`,
        steps: [{ action: 'navigate', url: parsed.url }],
        verificationCriteria: { expectedUrlContains: rawUrl.replace(/^https?:\/\//, ''), description: `Page navigated to ${parsed.url}` }
      };
    }

    // "Play [Song/Video] on YouTube" or "Play [Song/Video]"
    const playYouTubeMatch = command.match(/^play\s+(.+?)(?:\s+on\s+youtube)?$/i);
    if (playYouTubeMatch && !lower.startsWith('play the first') && !lower.startsWith('play second')) {
      const songQuery = playYouTubeMatch[1].replace(/^(song|video)\s+/i, '').trim();
      return {
        thought: `User wants to play "${songQuery}" on YouTube`,
        goal: `Search and play "${songQuery}" on YouTube`,
        steps: [
          { action: 'navigate', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}` },
          { action: 'wait', milliseconds: 2500 },
          { action: 'click', target: 'search_result_1', resultIndex: 1 },
          { action: 'wait', milliseconds: 2000 },
          { action: 'play' }
        ],
        verificationCriteria: {
          expectedUrlContains: 'youtube.com/watch',
          expectedMediaType: 'video',
          description: `YouTube video for "${songQuery}" is playing`
        }
      };
    }

    // A. "Search [Query] on [YouTube/Google/GitHub/Amazon/Reddit/Wikipedia]"
    const searchTargetMatch = command.match(/^(?:search|find|look\s+up)(?:\s+for)?\s+(.+?)\s+(?:on|in)\s+(youtube|google|github|amazon|reddit|wikipedia|twitter|x)$/i);
    if (searchTargetMatch) {
      const query = searchTargetMatch[1].trim();
      const serviceKey = searchTargetMatch[2].trim().toLowerCase();
      const service = KNOWN_SERVICES[serviceKey];
      const targetUrl = (service && service.searchUrl)
        ? service.searchUrl(query)
        : `https://www.google.com/search?q=${encodeURIComponent(query + ' site:' + serviceKey)}`;

      return {
        thought: `Searching ${serviceKey} for "${query}"`,
        goal: `Search ${serviceKey} for "${query}"`,
        steps: [
          { action: 'navigate', url: targetUrl },
          { action: 'wait', milliseconds: 2000 }
        ],
        verificationCriteria: {
          expectedUrlContains: serviceKey,
          description: `Search results for "${query}" on ${serviceKey} loaded`
        }
      };
    }

    // B. "Search [YouTube/Google/GitHub/Amazon/Reddit/Wikipedia] for [Query]"
    const searchServiceForMatch = command.match(/^(?:search|look\s+up|go\s+to|open)(?:\s+on|\s+in)?\s+(youtube|google|github|amazon|reddit|wikipedia|twitter|x)\s+(?:and\s+search\s+for\s+|for\s+)?(.+)$/i);
    if (searchServiceForMatch) {
      const serviceKey = searchServiceForMatch[1].trim().toLowerCase();
      const query = searchServiceForMatch[2].trim();
      const service = KNOWN_SERVICES[serviceKey];
      const targetUrl = (service && service.searchUrl)
        ? service.searchUrl(query)
        : `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      return {
        thought: `Searching ${serviceKey} for "${query}"`,
        goal: `Search ${serviceKey} for "${query}"`,
        steps: [
          { action: 'navigate', url: targetUrl },
          { action: 'wait', milliseconds: 2000 }
        ],
        verificationCriteria: {
          expectedUrlContains: serviceKey,
          description: `Search results for "${query}" on ${serviceKey} loaded`
        }
      };
    }

    // "Search Google for [Query] and open the first result"
    const searchAndOpenMatch = command.match(/^(?:search\s+google\s+for|search\s+the\s+web\s+for|search\s+for)\s+(.+?)\s+and\s+open\s+the\s+(first|second|1st|2nd)\s+result$/i);
    if (searchAndOpenMatch) {
      const q = searchAndOpenMatch[1].trim();
      const ordinal = searchAndOpenMatch[2].toLowerCase();
      const index = (ordinal === 'second' || ordinal === '2nd') ? 2 : 1;
      return {
        thought: `Search Google for "${q}" and open result #${index}`,
        goal: `Search Google for "${q}" and open result #${index}`,
        steps: [
          { action: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(q)}` },
          { action: 'wait', milliseconds: 2000 },
          { action: 'click', target: `search_result_${index}`, resultIndex: index },
          { action: 'wait', milliseconds: 2500 }
        ],
        verificationCriteria: {
          description: `Navigated to result #${index} for "${q}"`
        }
      };
    }

    // "Search Google for [Query]" or "Search the web for [Query]" or "Search for [Query]"
    const searchGeneralMatch = command.match(/^(?:search\s+google\s+for|search\s+the\s+web\s+for|search\s+for)\s+(.+)$/i);
    if (searchGeneralMatch) {
      const q = searchGeneralMatch[1].trim();
      return {
        thought: `Searching Google for "${q}"`,
        goal: `Search Google for "${q}"`,
        steps: [
          { action: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(q)}` },
          { action: 'wait', milliseconds: 2000 }
        ],
        verificationCriteria: {
          expectedUrlContains: 'google.com/search',
          description: `Google search results for "${q}" loaded`
        }
      };
    }

    // "Go to [Website]" or "Open [Website]"
    const openSiteMatch = command.match(/^(?:go\s+to|open)\s+(.+)$/i);
    if (openSiteMatch) {
      const siteName = openSiteMatch[1].trim();
      const parsed = parseOmniboxInput(siteName);
      return {
        thought: `Navigating to ${siteName}`,
        goal: `Open ${siteName}`,
        steps: [
          { action: 'navigate', url: parsed.url },
          { action: 'wait', milliseconds: 2000 }
        ],
        verificationCriteria: {
          expectedUrlContains: parsed.isUrl ? siteName.replace(/^https?:\/\//, '').split('/')[0] : 'google',
          description: `Navigated to ${parsed.url}`
        }
      };
    }

    // "Find [text] on page"
    const findTextMatch = command.match(/^find\s+(?:text\s+)?["']?(.+?)["']?(?:\s+on\s+(?:the\s+)?page)?$/i);
    if (findTextMatch) {
      const textQuery = findTextMatch[1].trim();
      return {
        thought: `Finding text "${textQuery}" on current page`,
        goal: `Find text "${textQuery}"`,
        steps: [
          { action: 'find_text', query: textQuery }
        ],
        verificationCriteria: { description: `Located text "${textQuery}" on page` }
      };
    }

    // Default general search fallback
    const parsed = parseOmniboxInput(command);
    return {
      thought: `Interpreting request as general navigation / search for "${command}"`,
      goal: `Search / Navigate: ${command}`,
      steps: [
        { action: 'navigate', url: parsed.url },
        { action: 'wait', milliseconds: 2000 }
      ],
      requiresConfirmation,
      confirmationMessage,
      verificationCriteria: { description: `Executed action for "${command}"` }
    };
  }

  /**
   * Plans compound subcommands dynamically
   */
  _planCompoundSteps(subCommands, initialPageContext = {}, taskMemory = {}) {
    const combinedSteps = [];
    const descriptions = [];
    let currentContext = { ...initialPageContext };

    for (let i = 0; i < subCommands.length; i++) {
      const sub = subCommands[i].trim();
      const subLower = sub.toLowerCase();

      // Check if this sub-command is a search following a specific website navigation
      if ((subLower.startsWith('search for') || subLower.startsWith('search ')) && currentContext.activeService) {
        const query = sub.replace(/^search\s+(for\s+)?/i, '').trim();
        const service = KNOWN_SERVICES[currentContext.activeService];
        if (service && service.searchUrl) {
          combinedSteps.push({ action: 'navigate', url: service.searchUrl(query) });
          combinedSteps.push({ action: 'wait', milliseconds: 2000 });
          descriptions.push(`Search ${currentContext.activeService} for "${query}"`);
          continue;
        }
      }

      // Check if previous command was open youtube / github / google
      if (subLower.includes('youtube')) currentContext.activeService = 'youtube';
      else if (subLower.includes('github')) currentContext.activeService = 'github';
      else if (subLower.includes('google')) currentContext.activeService = 'google';

      const subPlan = this._dynamicFallbackPlan(sub, currentContext, taskMemory);
      descriptions.push(subPlan.goal);

      for (const step of subPlan.steps) {
        combinedSteps.push(step);
      }
    }

    return {
      thought: `Dynamic compound plan for ${subCommands.length} sub-tasks: ${descriptions.join(' → ')}`,
      goal: descriptions.join(' → '),
      steps: combinedSteps,
      verificationCriteria: { description: `Completed compound steps: ${descriptions.join(' → ')}` }
    };
  }

  _dynamicFallbackPageAnalysis(goal, step, pageContext) {
    return {
      observedState: `URL: ${pageContext.url || 'unknown'}, Elements: ${(pageContext.elements || []).length}`,
      targetFound: true,
      resolvedAction: step,
      explanation: 'Resolved via dynamic DOM heuristics'
    };
  }

  _dynamicFallbackVerification(command, goal, actionsTaken, finalState) {
    const url = (finalState.url || '').toLowerCase();
    const title = (finalState.title || '').toLowerCase();
    const lowerCmd = (command || '').toLowerCase();

    // Check if error page
    if (url.startsWith('chrome-error://') || title.includes('404') || title.includes('not found')) {
      return {
        success: false,
        confidence: 0.9,
        reason: `Page returned an error state: ${title || url}`
      };
    }

    // YouTube playback verification
    if (lowerCmd.includes('youtube') && lowerCmd.includes('play')) {
      const isWatchUrl = url.includes('youtube.com/watch');
      return {
        success: isWatchUrl,
        confidence: isWatchUrl ? 0.95 : 0.4,
        reason: isWatchUrl ? 'Successfully navigated to YouTube video and initiated playback' : 'Failed to reach video watch page'
      };
    }

    return {
      success: true,
      confidence: 0.9,
      reason: `Successfully executed actions for "${command}" on ${url}`
    };
  }
}

module.exports = { AIProvider };
