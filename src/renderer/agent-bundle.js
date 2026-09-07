/**
 * Nova Agent Core - Browser-Native Bundle for Renderer
 * Self-contained autonomous agent engine for direct DOM and Webview orchestration.
 * Includes structured stage logging: [COMMAND], [AI], [PLAN], [EXECUTOR], [BROWSER], [VERIFY], [TASK]
 */

(() => {
  // =========================================================================
  // 1. STRUCTURED LOGGER
  // =========================================================================
  class Logger {
    static format(stage, message, data = null) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
      let logStr = `[${timestamp}] [${stage.toUpperCase()}] ${message}`;
      if (data !== null && data !== undefined) {
        if (typeof data === 'object') {
          try { logStr += ` | ${JSON.stringify(data)}`; } catch (e) { logStr += ` | [Object]`; }
        } else {
          logStr += ` | ${data}`;
        }
      }
      return logStr;
    }

    static command(msg, data) { console.log(`%c${Logger.format('COMMAND', msg, data)}`, 'color: #06b6d4; font-weight: bold;'); }
    static ai(msg, data) { console.log(`%c${Logger.format('AI', msg, data)}`, 'color: #a855f7; font-weight: bold;'); }
    static plan(msg, data) { console.log(`%c${Logger.format('PLAN', msg, data)}`, 'color: #6366f1; font-weight: bold;'); }
    static executor(msg, data) { console.log(`%c${Logger.format('EXECUTOR', msg, data)}`, 'color: #eab308; font-weight: bold;'); }
    static browser(msg, data) { console.log(`%c${Logger.format('BROWSER', msg, data)}`, 'color: #22c55e; font-weight: bold;'); }
    static verify(msg, data) { console.log(`%c${Logger.format('VERIFY', msg, data)}`, 'color: #ec4899; font-weight: bold;'); }
    static task(msg, data) { console.log(`%c${Logger.format('TASK', msg, data)}`, 'color: #10b981; font-weight: bold; font-size: 13px;'); }
    static error(msg, err) { console.error(`%c${Logger.format('ERROR', msg, err)}`, 'color: #ef4444; font-weight: bold;'); }
  }

  // =========================================================================
  // 2. CONFIG & WEBSITES
  // =========================================================================
  const KNOWN_SERVICES = {
    youtube: {
      domain: 'youtube.com',
      home: 'https://www.youtube.com',
      searchUrl: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
    },
    google: {
      domain: 'google.com',
      home: 'https://www.google.com',
      searchUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
    },
    github: {
      domain: 'github.com',
      home: 'https://github.com',
      searchUrl: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`
    },
    gmail: {
      domain: 'mail.google.com',
      home: 'https://mail.google.com',
      searchUrl: (q) => `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`
    },
    amazon: {
      domain: 'amazon.in',
      home: 'https://www.amazon.in',
      searchUrl: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`
    },
    reddit: {
      domain: 'reddit.com',
      home: 'https://www.reddit.com',
      searchUrl: (q) => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`
    },
    wikipedia: {
      domain: 'wikipedia.org',
      home: 'https://www.wikipedia.org',
      searchUrl: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`
    },
    twitter: {
      domain: 'x.com',
      home: 'https://x.com',
      searchUrl: (q) => `https://x.com/search?q=${encodeURIComponent(q)}`
    }
  };

  function parseOmniboxInput(input) {
    if (!input || typeof input !== 'string') {
      return { isUrl: true, url: 'about:blank' };
    }

    const trimmed = input.trim();

    if (/^https?:\/\//i.test(trimmed) || /^about:/i.test(trimmed) || /^file:\/\//i.test(trimmed)) {
      return { isUrl: true, url: trimmed };
    }

    const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/;
    const localhostPattern = /^localhost(:\d+)?(\/.*)?$/;

    if (domainPattern.test(trimmed) || localhostPattern.test(trimmed)) {
      return { isUrl: true, url: `https://${trimmed}` };
    }

    const lower = trimmed.toLowerCase();
    if (KNOWN_SERVICES[lower]) {
      return { isUrl: true, url: KNOWN_SERVICES[lower].home };
    }

    return {
      isUrl: false,
      url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
      query: trimmed
    };
  }

  // =========================================================================
  // 3. COMMAND PARSER
  // =========================================================================
  class CommandParser {
    static splitCompoundCommands(text) {
      if (!text || typeof text !== 'string') return [];
      const cleaned = text.trim();
      if (!cleaned) return [];

      let normalized = cleaned
        .replace(/\s*,\s*and\s+then\s+/gi, '|~|')
        .replace(/\s*,\s*then\s+/gi, '|~|')
        .replace(/\s+and\s+then\s+/gi, '|~|')
        .replace(/\s+then\s+/gi, '|~|')
        .replace(/\s*;\s*/g, '|~|')
        .replace(/\s*,\s*and\s+/gi, '|~|');

      const commaParts = normalized.split(/\s*,\s*/);
      const actionVerbRegex = /^(open|go to|search|play|find|click|type|switch|close|scroll|navigate|reload|back|forward|select)\b/i;

      const parts = [];
      for (let i = 0; i < commaParts.length; i++) {
        const p = commaParts[i];
        if (p.includes('|~|')) {
          const sub = p.split('|~|');
          parts.push(...sub);
        } else if (i === 0 || actionVerbRegex.test(p)) {
          parts.push(p);
        } else {
          if (parts.length > 0) {
            parts[parts.length - 1] += ', ' + p;
          } else {
            parts.push(p);
          }
        }
      }

      return parts.map(s => s.trim()).filter(Boolean);
    }

    static extractRelativeReference(text) {
      const ordinalMap = {
        'first': 1, '1st': 1, 'one': 1,
        'second': 2, '2nd': 2, 'two': 2,
        'third': 3, '3rd': 3, 'three': 3,
        'fourth': 4, '4th': 4, 'four': 4,
        'fifth': 5, '5th': 5, 'five': 5
      };

      const match = text.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s*(?:result|video|link|item|one|course|product|page)?\b/i);
      if (match) {
        const word = match[1].toLowerCase();
        return {
          found: true,
          index: ordinalMap[word] || 1,
          raw: match[0]
        };
      }
      return { found: false, index: null };
    }

    static checkSensitivity(text) {
      const sensitivePatterns = [
        { pattern: /\b(send\s+(?:an?\s+)?email|send\s+mail)\b/i, reason: 'Send email' },
        { pattern: /\b(send\s+(?:a\s+)?whatsapp\s+message|whatsapp)\b/i, reason: 'Send messaging chat' },
        { pattern: /\b(purchase|buy\s+now|checkout|pay\s+now|transfer\s+money)\b/i, reason: 'Financial / Purchase transaction' },
        { pattern: /\b(delete\s+(?:all\s+)?files?|remove\s+account|format\s+drive)\b/i, reason: 'Destructive deletion operation' },
        { pattern: /\b(submit\s+form|apply\s+now)\b/i, reason: 'External form submission' }
      ];

      for (const { pattern, reason } of sensitivePatterns) {
        if (pattern.test(text)) {
          return { isSensitive: true, reason };
        }
      }

      return { isSensitive: false };
    }
  }

  // =========================================================================
  // 4. PROMPTS
  // =========================================================================
  const SYSTEM_PROMPT_PLANNER = `You are Nova, an autonomous AI browser agent.
Your mission is to understand user requests and break them down into a sequence of concrete, structured browser/computer actions.

AVAILABLE ACTIONS:
1. NAVIGATION:
   - {"action": "navigate", "url": "https://..."}
   - {"action": "go_back"}
   - {"action": "go_forward"}
   - {"action": "reload"}
   - {"action": "new_tab", "url": "https://..." (optional)}
   - {"action": "close_tab"}
   - {"action": "switch_tab", "tabIndex": number}

2. WEBPAGE INTERACTION:
   - {"action": "click", "target": "accessible name, button text, search result title, selector or semantic description"}
   - {"action": "type", "target": "input description or selector", "text": "text to type", "submit": true/false}
   - {"action": "clear_input", "target": "input description"}
   - {"action": "scroll", "direction": "down"|"up", "amount": number}
   - {"action": "press_key", "key": "Enter"|"Tab"|"Escape"}
   - {"action": "wait", "milliseconds": number}
   - {"action": "read_page"}
   - {"action": "find_text", "query": "text to search on page"}

3. MEDIA:
   - {"action": "play"}
   - {"action": "pause"}

4. COMPUTER / OS (Controlled):
   - {"action": "open_application", "appName": "Visual Studio Code" | "Terminal" | ...}
   - {"action": "open_folder", "folderName": "Downloads" | "Documents" | ...}

Respond strictly in JSON:
{
  "thought": "Reasoning about user's request",
  "goal": "High-level goal",
  "steps": [
    { "action": "...", ... }
  ],
  "verificationCriteria": {
    "expectedUrlContains": "optional string",
    "expectedMediaType": "video" (if playing media),
    "description": "How to verify success"
  }
}`;

  // =========================================================================
  // 5. AI PROVIDER
  // =========================================================================
  class AIProvider {
    constructor(config = {}) {
      this.geminiApiKey = config.geminiApiKey || '';
      this.openaiApiKey = config.openaiApiKey || '';
      this.model = config.model || 'gemini-2.0-flash';
    }

    updateConfig(config) {
      if (config.geminiApiKey !== undefined) this.geminiApiKey = config.geminiApiKey;
      if (config.openaiApiKey !== undefined) this.openaiApiKey = config.openaiApiKey;
      if (config.model !== undefined) this.model = config.model;
    }

    async createPlan({ command, pageContext = {}, taskMemory = {} }) {
      Logger.ai(`Analyzing command intent: "${command}"`);

      if (this.geminiApiKey) {
        try {
          const plan = await this._callGeminiPlanner(command, pageContext, taskMemory);
          if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
            Logger.ai(`Gemini plan generated: ${plan.goal}`);
            return plan;
          }
        } catch (err) {
          Logger.error('Gemini API planning error:', err);
        }
      }

      if (this.openaiApiKey) {
        try {
          const plan = await this._callOpenAIPlanner(command, pageContext, taskMemory);
          if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
            Logger.ai(`OpenAI plan generated: ${plan.goal}`);
            return plan;
          }
        } catch (err) {
          Logger.error('OpenAI API planning error:', err);
        }
      }

      const plan = this._dynamicFallbackPlan(command, pageContext, taskMemory);
      Logger.ai(`Dynamic plan generated: ${plan.goal} (${plan.steps.length} steps)`);
      return plan;
    }

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
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      });

      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const data = await res.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
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

      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
      const data = await res.json();
      return JSON.parse(data.choices?.[0]?.message?.content);
    }

    _dynamicFallbackPlan(rawCommand, pageContext = {}, taskMemory = {}) {
      const command = rawCommand.trim();
      const lower = command.toLowerCase();
      const sensitivity = CommandParser.checkSensitivity(command);

      const requiresConfirmation = sensitivity.isSensitive;
      const confirmationMessage = sensitivity.reason ? `Nova wants permission to: ${sensitivity.reason}` : '';

      // 1. Navigation controls
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

      // 2. Tab management
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

      // 4. Compound Multi-step instructions
      const subCommands = CommandParser.splitCompoundCommands(command);
      if (subCommands.length > 1) {
        return this._planCompoundSteps(subCommands, pageContext, taskMemory);
      }

      // 5. Relative references based on previous state
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
      const directUrlMatch = command.match(/^open\s+(this\s+website:\s*|url:\s*)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s]*)?|https?:\/\/[^\s]+)$/i);
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

      // Play song / video
      const playYouTubeMatch = command.match(/^play\s+(.+?)(?:\s+on\s+youtube)?$/i);
      if (playYouTubeMatch && !lower.startsWith('play the first') && !lower.startsWith('play second')) {
        let songQuery = playYouTubeMatch[1].trim();
        if (/^(a\s+)?song$/i.test(songQuery) || /^music$/i.test(songQuery)) {
          songQuery = 'popular songs';
        }
        return {
          thought: `User wants to play "${songQuery}" on YouTube`,
          goal: `Search and play "${songQuery}" on YouTube`,
          steps: [
            { action: 'navigate', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}` },
            { action: 'wait', milliseconds: 2500 },
            { action: 'click', target: 'search_result_1', resultIndex: 1 },
            { action: 'wait', milliseconds: 2500 },
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

    _planCompoundSteps(subCommands, initialPageContext = {}, taskMemory = {}) {
      const combinedSteps = [];
      const descriptions = [];
      let currentContext = { ...initialPageContext };

      for (let i = 0; i < subCommands.length; i++) {
        const sub = subCommands[i].trim();
        const subLower = sub.toLowerCase();

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
  }

  // =========================================================================
  // 6. ACTION EXECUTOR
  // =========================================================================
  class ActionExecutor {
    constructor(context = {}) {
      this.context = context;
    }

    setContext(context) {
      this.context = { ...this.context, ...context };
    }

    async execute(action, onStatusUpdate = () => {}) {
      const type = action.action;
      Logger.executor(`Executing action: ${type}`, action);

      try {
        switch (type) {
          case 'navigate':
          case 'open_url':
            onStatusUpdate(`Opening ${action.url}...`);
            Logger.browser(`Navigating to ${action.url}`);
            if (this.context.navigateTab) {
              const res = await this.context.navigateTab(action.url);
              Logger.browser(`Navigation status for ${action.url}`, res);
              return { success: true, url: action.url };
            }
            throw new Error('Navigation handler not available in executor context');

          case 'go_back':
            onStatusUpdate('Navigating back...');
            Logger.browser('Navigating back');
            if (this.context.goBack) {
              await this.context.goBack();
              return { success: true };
            }
            throw new Error('goBack handler not available');

          case 'go_forward':
            onStatusUpdate('Navigating forward...');
            Logger.browser('Navigating forward');
            if (this.context.goForward) {
              await this.context.goForward();
              return { success: true };
            }
            throw new Error('goForward handler not available');

          case 'reload':
            onStatusUpdate('Reloading page...');
            Logger.browser('Reloading page');
            if (this.context.reload) {
              await this.context.reload();
              return { success: true };
            }
            throw new Error('reload handler not available');

          case 'new_tab':
            onStatusUpdate(`Opening new tab: ${action.url || 'about:blank'}`);
            Logger.browser(`Opening new tab: ${action.url}`);
            if (this.context.createTab) {
              const newTab = await this.context.createTab(action.url || 'about:blank');
              return { success: true, tab: newTab };
            }
            throw new Error('createTab handler not available');

          case 'close_tab':
            onStatusUpdate('Closing tab...');
            Logger.browser('Closing active tab');
            if (this.context.closeTab) {
              await this.context.closeTab();
              return { success: true };
            }
            throw new Error('closeTab handler not available');

          case 'click':
            return await this._executeClickWithRetries(action, onStatusUpdate);

          case 'type':
            return await this._executeTypeWithRetries(action, onStatusUpdate);

          case 'scroll':
            return await this._executeScroll(action, onStatusUpdate);

          case 'press_key':
            return await this._executeKeyPress(action, onStatusUpdate);

          case 'play':
          case 'pause':
            return await this._executeMediaControl(type, onStatusUpdate);

          case 'wait':
            const ms = action.milliseconds || 1000;
            onStatusUpdate(`Waiting ${Math.round(ms / 1000)}s...`);
            Logger.browser(`Waiting ${ms}ms for page stabilization`);
            await new Promise(r => setTimeout(r, ms));
            return { success: true, waited: ms };

          case 'find_text':
            return await this._executeFindText(action, onStatusUpdate);

          case 'open_application':
            onStatusUpdate(`Opening application ${action.appName}...`);
            Logger.browser(`Launching application: ${action.appName}`);
            if (this.context.openApp) {
              return await this.context.openApp(action.appName);
            }
            if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
              return await window.novaAPI.system.openApp(action.appName);
            }
            return { success: true, appName: action.appName, simulated: true };

          case 'open_folder':
            onStatusUpdate(`Opening folder ${action.folderName}...`);
            Logger.browser(`Opening folder: ${action.folderName}`);
            if (this.context.openFolder) {
              return await this.context.openFolder(action.folderName);
            }
            if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
              return await window.novaAPI.system.openFolder(action.folderName);
            }
            return { success: true, folderName: action.folderName, simulated: true };

          case 'open_file':
            const targetFile = action.target || action.filePath || action.fileName;
            onStatusUpdate(`Opening file "${targetFile}"...`);
            Logger.browser(`Opening file: ${targetFile}`);
            if (this.context.openFile) {
              return await this.context.openFile(targetFile);
            }
            if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
              return await window.novaAPI.system.openFile(targetFile);
            }
            return { success: true, file: targetFile, simulated: true };

          case 'system_power':
            onStatusUpdate(`Executing system power command: ${action.mode}...`);
            Logger.browser(`Executing system power: ${action.mode}`);
            if (this.context.handlePower) {
              return await this.context.handlePower(action.mode);
            }
            if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
              return await window.novaAPI.system.handlePower(action.mode);
            }
            return { success: true, mode: action.mode, simulated: true };

          case 'system_volume':
            onStatusUpdate(`Adjusting system volume (${action.mode || 'set'})...`);
            Logger.browser(`Adjusting volume: ${action.mode} ${action.level || ''}`);
            if (this.context.handleVolume) {
              return await this.context.handleVolume(action.mode, action.level);
            }
            if (typeof window !== 'undefined' && window.novaAPI && window.novaAPI.system) {
              return await window.novaAPI.system.handleVolume(action.mode, action.level);
            }
            return { success: true, mode: action.mode, simulated: true };

          default:
            return { success: false, error: `Unhandled action type: ${type}` };
        }
      } catch (err) {
        Logger.error(`Executor error on ${type}:`, err);
        return { success: false, error: err.message };
      }
    }

    async _executeClickWithRetries(action, onStatusUpdate) {
      const target = action.target || '';
      const resultIndex = action.resultIndex || 1;
      onStatusUpdate(`Clicking ${target || `result #${resultIndex}`}...`);
      Logger.browser(`Clicking target "${target}" (index: ${resultIndex})`);

      const clickScript = `
      (() => {
        try {
          const targetDesc = ${JSON.stringify(target)}.toLowerCase();
          const resultIdx = ${resultIndex};
          const url = window.location.href;

          // 1. YouTube direct navigation
          if (url.includes('youtube.com')) {
            const allLinks = Array.from(document.querySelectorAll('a[href*="/watch"], a[href*="watch?v="], ytd-video-renderer a#video-title, #video-title-link, a#thumbnail[href*="watch"], ytd-compact-video-renderer a#thumbnail[href*="watch"], ytd-rich-item-renderer a#video-title-link, a#video-title'));
            let validLinks = [];
            for (const a of allLinks) {
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

          // 4. Try text matching on buttons / links
          const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"]'));
          for (const el of candidates) {
            const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().toLowerCase();
            if (text && (text === targetDesc || text.includes(targetDesc) || targetDesc.includes(text))) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.click();
              return { success: true, method: 'text_match', text };
            }
          }

          // 5. Try standard CSS selector
          try {
            const el = document.querySelector(targetDesc);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.click();
              return { success: true, method: 'css_selector' };
            }
          } catch (e) {}

          // 6. First clickable item fallback
          const firstLink = document.querySelector('h3 a, a h3, main a, article a');
          if (firstLink) {
            const actualLink = firstLink.tagName === 'A' ? firstLink : firstLink.closest('a');
            if (actualLink && actualLink.href) {
              window.location.href = actualLink.href;
              return { success: true, method: 'first_link_fallback' };
            }
          }

          return { success: false, error: 'Target element not found on page' };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })();
      `;

      if (!this.context.executeScript) throw new Error('executeScript context missing');
      
      // Retry loop with progressive backoff
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await this.context.executeScript(clickScript);
        if (res && res.success) {
          Logger.browser(`Click succeeded on attempt ${attempt}:`, res);
          return res;
        }
        if (attempt < 3) {
          onStatusUpdate(`Waiting for elements to load (attempt ${attempt + 1}/3)...`);
          Logger.browser(`Click attempt ${attempt} waiting 1500ms for DOM elements`);
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      return { success: false, error: 'Target element not found after 3 attempts' };
    }

    async _executeTypeWithRetries(action, onStatusUpdate) {
      const text = action.text;
      const target = action.target || 'search';
      const submit = action.submit !== false;
      onStatusUpdate(`Typing "${text}"...`);
      Logger.browser(`Typing "${text}" into ${target} (submit: ${submit})`);

      const typeScript = `
      (() => {
        try {
          const textToType = ${JSON.stringify(text)};
          const shouldSubmit = ${submit};

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

          let input = null;
          for (const sel of searchSelectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) {
              input = el;
              break;
            }
          }

          if (!input) {
            const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
            input = allInputs.find(el => el.offsetParent !== null);
          }

          if (!input) return { success: false, error: 'No input field found on page' };

          input.focus();
          input.value = textToType;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

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

      if (!this.context.executeScript) throw new Error('executeScript context missing');
      return await this.context.executeScript(typeScript);
    }

    async _executeScroll(action, onStatusUpdate) {
      const direction = action.direction || 'down';
      const amount = action.amount || 600;
      onStatusUpdate(`Scrolling ${direction}...`);
      Logger.browser(`Scrolling ${direction} by ${amount}px`);

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
      Logger.browser(`Pressing key "${key}"`);

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
      onStatusUpdate(type === 'play' ? 'Starting playback...' : 'Pausing video...');
      Logger.browser(`Media control: ${type}`);

      const mediaScript = `
      (() => {
        try {
          const videos = Array.from(document.querySelectorAll('video, audio'));
          for (const v of videos) {
            if (${type === 'play' ? 'true' : 'false'}) {
              v.muted = false;
              v.play().catch(() => {
                v.muted = true;
                v.play();
              });
            } else {
              v.pause();
            }
          }

          const playBtn = document.querySelector('.ytp-play-button');
          if (playBtn) playBtn.click();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', keyCode: 75, code: 'KeyK', bubbles: true }));

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
      Logger.browser(`Searching page text for "${query}"`);

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

  // =========================================================================
  // 7. TASK VERIFIER & MANAGER
  // =========================================================================
  class TaskVerifier {
    static verify({ command, goal, actionsTaken, finalState = {}, verificationCriteria = {} }) {
      const url = (finalState.url || '').toLowerCase();
      const title = (finalState.title || '').toLowerCase();
      const cmd = (command || '').toLowerCase();

      Logger.verify(`Verifying task outcome. URL: "${url}", Title: "${title}"`);

      if (url.startsWith('chrome-error://') || url.includes('dnserror') || title.includes('404') || title.includes('site can’t be reached')) {
        return {
          success: false,
          confidence: 0.95,
          reason: `Failed to load page. Browser reported: ${title || url}`
        };
      }

      if (verificationCriteria.expectedUrlContains) {
        const expected = verificationCriteria.expectedUrlContains.toLowerCase();
        if (!url.includes(expected)) {
          return {
            success: false,
            confidence: 0.85,
            reason: `Current URL "${url}" does not contain expected pattern "${expected}"`
          };
        }
      }

      if (verificationCriteria.expectedMediaType === 'video' || (cmd.includes('play') && cmd.includes('youtube'))) {
        const isWatch = url.includes('youtube.com/watch');
        return {
          success: isWatch,
          confidence: isWatch ? 0.95 : 0.4,
          reason: isWatch ? 'YouTube video page loaded and playback initiated' : 'Failed to reach video watch page'
        };
      }

      if (url && url !== 'about:blank') {
        return {
          success: true,
          confidence: 0.9,
          reason: `Successfully loaded ${finalState.title || url}`
        };
      }

      return {
        success: true,
        confidence: 0.8,
        reason: 'Actions completed successfully'
      };
    }
  }

  class TaskManager {
    constructor({ planner, executor, onRequestPermission, onTaskEvent }) {
      this.planner = planner;
      this.executor = executor;
      this.onRequestPermission = onRequestPermission || (async () => true);
      this.onTaskEvent = onTaskEvent || (() => {});
      this.memory = { history: [], lastSearchResults: [] };
      this.currentTask = null;
      this.isAborted = false;
    }

    setContext(context) {
      this.executor.setContext(context);
    }

    abortCurrentTask() {
      this.isAborted = true;
      Logger.task('Task aborted by user request');
      this.emitEvent('task_aborted', { message: 'Task cancelled by user.' });
    }

    emitEvent(type, payload = {}) {
      this.onTaskEvent({
        type,
        timestamp: Date.now(),
        taskId: this.currentTask ? this.currentTask.id : null,
        ...payload
      });
    }

    async runTask(userCommand) {
      this.isAborted = false;
      const taskId = 'task_' + Date.now();
      this.currentTask = {
        id: taskId,
        command: userCommand,
        actionsTaken: [],
        startTime: Date.now()
      };

      Logger.command(`User command received: "${userCommand}"`);

      this.emitEvent('task_started', {
        command: userCommand,
        status: 'Understanding request...'
      });

      try {
        // 1. OBSERVE INITIAL STATE
        const initialPageContext = await this._observeCurrentPage();

        // 2. PLAN
        this.emitEvent('planning', { status: 'Planning steps...' });
        const plan = await this.planner.planTask({
          command: userCommand,
          pageContext: initialPageContext,
          taskMemory: this.memory
        });

        Logger.plan(`Plan established: ${plan.goal}`, plan.steps);

        this.currentTask.plan = plan;
        this.emitEvent('plan_created', {
          thought: plan.thought,
          goal: plan.goal,
          stepCount: plan.steps.length,
          steps: plan.steps
        });

        // 3. CHECK PERMISSION
        if (plan.requiresConfirmation) {
          Logger.task(`Permission required for sensitive action: ${plan.confirmationMessage}`);
          this.emitEvent('permission_requested', {
            message: plan.confirmationMessage || `Nova requires approval for: "${userCommand}"`
          });

          const allowed = await this.onRequestPermission({
            command: userCommand,
            reason: plan.confirmationMessage || 'Sensitive browser action'
          });

          if (!allowed) {
            Logger.task('Permission denied by user');
            this.emitEvent('permission_denied', { message: 'Action cancelled by user.' });
            return { success: false, reason: 'Action denied by user' };
          }
        }

        // 4. EXECUTE STEPS
        for (let i = 0; i < plan.steps.length; i++) {
          if (this.isAborted) {
            this.emitEvent('task_aborted', { message: 'Task stopped.' });
            return { success: false, reason: 'Task aborted' };
          }

          const step = plan.steps[i];
          const stepNum = i + 1;
          const totalSteps = plan.steps.length;

          Logger.executor(`[Step ${stepNum}/${totalSteps}] Starting action: ${step.action}`, step);

          this.emitEvent('step_started', {
            stepIndex: i,
            stepNumber: stepNum,
            totalSteps,
            step,
            status: `Executing step ${stepNum}/${totalSteps}: ${step.action}`
          });

          const result = await this.executor.execute(step, (status) => {
            this.emitEvent('step_progress', { stepIndex: i, status });
          });

          this.currentTask.actionsTaken.push({ step, result });

          if (!result.success && !step.optional) {
            Logger.error(`[Step ${stepNum}/${totalSteps}] Failed:`, result.error);
            this.emitEvent('step_failed', {
              stepIndex: i,
              error: result.error,
              status: `Step ${stepNum} issue: ${result.error}`
            });
          } else {
            Logger.executor(`[Step ${stepNum}/${totalSteps}] Success:`, result);
            this.emitEvent('step_completed', {
              stepIndex: i,
              result,
              status: `Completed step ${stepNum}/${totalSteps}`
            });
          }

          await new Promise(r => setTimeout(r, 600));
        }

        // 5. OBSERVE FINAL & VERIFY
        this.emitEvent('verifying', { status: 'Verifying task completion...' });
        const finalPageContext = await this._observeCurrentPage();

        const verification = TaskVerifier.verify({
          command: userCommand,
          goal: plan.goal,
          actionsTaken: this.currentTask.actionsTaken,
          finalState: finalPageContext,
          verificationCriteria: plan.verificationCriteria
        });

        if (verification.success) {
          Logger.task(`Task Completed Successfully: ${verification.reason}`);
          this.emitEvent('task_completed', {
            success: true,
            goal: plan.goal,
            reason: verification.reason,
            status: 'Task completed.'
          });
          return { success: true, goal: plan.goal, reason: verification.reason };
        } else {
          Logger.task(`Task Completed with Note: ${verification.reason}`);
          this.emitEvent('task_completed_warning', {
            success: false,
            goal: plan.goal,
            reason: verification.reason,
            status: `Completed with note: ${verification.reason}`
          });
          return { success: false, goal: plan.goal, reason: verification.reason };
        }

      } catch (err) {
        Logger.error('Task Execution Exception:', err);
        this.emitEvent('task_failed', {
          error: err.message,
          status: `Task failed: ${err.message}`
        });
        return { success: false, error: err.message };
      }
    }

    async _observeCurrentPage() {
      try {
        if (this.executor.context && this.executor.context.executeScript) {
          const obs = await this.executor.context.executeScript(`
          (() => {
            return {
              url: window.location.href,
              title: document.title || '',
              media: {
                hasVideo: document.querySelectorAll('video').length > 0,
                isPlaying: Array.from(document.querySelectorAll('video')).some(v => !v.paused)
              }
            };
          })();
          `);
          if (obs && !obs.error) return obs;
        }
      } catch (e) {}

      return { url: 'about:blank', title: '' };
    }
  }

  // =========================================================================
  // 8. TASK PLANNER & BROWSER AGENT
  // =========================================================================
  class TaskPlanner {
    constructor(aiProvider) {
      this.aiProvider = aiProvider || new AIProvider();
    }

    async planTask({ command, pageContext = {}, taskMemory = {} }) {
      const plan = await this.aiProvider.createPlan({ command, pageContext, taskMemory });
      return {
        command,
        thought: plan.thought || 'Formulated action plan',
        goal: plan.goal || command,
        steps: plan.steps || [],
        requiresConfirmation: plan.requiresConfirmation || false,
        confirmationMessage: plan.confirmationMessage || '',
        verificationCriteria: plan.verificationCriteria || {}
      };
    }
  }

  class BrowserAgent {
    constructor(options = {}) {
      this.aiProvider = new AIProvider(options.aiConfig || {});
      this.planner = new TaskPlanner(this.aiProvider);
      this.executor = new ActionExecutor(options.executorContext || {});
      this.taskManager = new TaskManager({
        planner: this.planner,
        executor: this.executor,
        onRequestPermission: options.onRequestPermission,
        onTaskEvent: options.onTaskEvent
      });
    }

    setExecutionContext(context) {
      this.taskManager.setContext(context);
    }

    async executeCommand(command) {
      return await this.taskManager.runTask(command);
    }

    abort() {
      this.taskManager.abortCurrentTask();
    }

    updateConfig(config) {
      this.aiProvider.updateConfig(config);
    }
  }

  // Export to window global
  window.NovaAgent = {
    Logger,
    BrowserAgent,
    TaskPlanner,
    ActionExecutor,
    TaskManager,
    AIProvider,
    parseOmniboxInput,
    KNOWN_SERVICES
  };
})();
