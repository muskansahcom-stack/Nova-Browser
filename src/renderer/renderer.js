/**
 * Renderer Controller for Nova Browser
 * Coordinates Tabs, Real WebViews, Omnibox, AI Command Bar, Voice Input, and Live Activity Log.
 */

// Browser-safe Omnibox URL helper
const parseOmniboxInput = (input) => {
  if (window.novaAPI && window.novaAPI.parseOmniboxInput) {
    return window.novaAPI.parseOmniboxInput(input);
  }
  if (!input || typeof input !== 'string') return { isUrl: true, url: 'about:blank' };
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed) || /^about:/i.test(trimmed) || /^file:\/\//i.test(trimmed)) {
    return { isUrl: true, url: trimmed };
  }
  const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/;
  if (domainPattern.test(trimmed)) return { isUrl: true, url: `https://${trimmed}` };
  const known = {
    'youtube': 'https://www.youtube.com',
    'google': 'https://www.google.com',
    'github': 'https://github.com',
    'gmail': 'https://mail.google.com'
  };
  if (known[trimmed.toLowerCase()]) return { isUrl: true, url: known[trimmed.toLowerCase()] };
  return { isUrl: false, url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}` };
};

// State
let tabs = [];
let activeTabId = null;
let tabIdCounter = 1;
let currentTaskRunning = false;
let browserAgent = null;
let speechRecognizer = null;
let isVoiceRecording = false;

// DOM Elements
const tabsContainer = document.getElementById('tabsContainer');
const newTabBtn = document.getElementById('newTabBtn');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const reloadBtn = document.getElementById('reloadBtn');
const addressBar = document.getElementById('addressBar');
const goBtn = document.getElementById('goBtn');
const browserViewport = document.getElementById('browserViewport');

const aiCommandInput = document.getElementById('aiCommandInput');
const aiSubmitBtn = document.getElementById('aiSubmitBtn');
const voiceBtn = document.getElementById('voiceBtn');
const togglePanelBtn = document.getElementById('togglePanelBtn');
const activitySidebar = document.getElementById('activitySidebar');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

const statusRing = document.getElementById('statusRing');
const statusLabel = document.getElementById('statusLabel');
const statusSub = document.getElementById('statusSub');
const abortTaskBtn = document.getElementById('abortTaskBtn');
const planCard = document.getElementById('planCard');
const planGoal = document.getElementById('planGoal');
const planStepsCount = document.getElementById('planStepsCount');
const stepsList = document.getElementById('stepsList');
const activityFeed = document.getElementById('activityFeed');

const permissionModal = document.getElementById('permissionModal');
const permissionMessage = document.getElementById('permissionMessage');
const allowPermissionBtn = document.getElementById('allowPermissionBtn');
const denyPermissionBtn = document.getElementById('denyPermissionBtn');

const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const geminiKeyInput = document.getElementById('geminiKeyInput');
const openaiKeyInput = document.getElementById('openaiKeyInput');
const modelSelect = document.getElementById('modelSelect');

let pendingPermissionPromiseResolve = null;

const isElectron = typeof window.novaAPI !== 'undefined' || (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0);

// =========================================================================
// Tab Management (Universal Web & Electron)
// =========================================================================

function createTab(initialUrl = 'https://www.google.com') {
  const tabId = 'tab_' + (tabIdCounter++);
  const parsed = parseOmniboxInput(initialUrl);
  const targetUrl = parsed.url;

  // 1. Create Viewport Element (webview in Electron, proxy iframe in Web)
  let viewEl;
  if (isElectron) {
    viewEl = document.createElement('webview');
    viewEl.id = 'wv_' + tabId;
    viewEl.setAttribute('src', targetUrl);
    viewEl.setAttribute('allowpopups', 'true');
    viewEl.setAttribute('webpreferences', 'contextIsolation=true, sandbox=false');
  } else {
    viewEl = document.createElement('iframe');
    viewEl.id = 'if_' + tabId;
    viewEl.setAttribute('src', targetUrl.startsWith('/') || targetUrl === 'about:blank' ? targetUrl : `/proxy?url=${encodeURIComponent(targetUrl)}`);
    viewEl.setAttribute('allow', 'autoplay; camera; microphone; fullscreen; clipboard-read; clipboard-write');
  }

  browserViewport.appendChild(viewEl);

  // 2. Create Tab Strip Item
  const tabEl = document.createElement('div');
  tabEl.className = 'tab-item';
  tabEl.id = 'btn_' + tabId;
  tabEl.innerHTML = `
    <span class="tab-title">Loading...</span>
    <span class="tab-close" title="Close tab">✕</span>
  `;

  tabEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-close')) {
      e.stopPropagation();
      closeTab(tabId);
    } else {
      switchTab(tabId);
    }
  });

  tabsContainer.appendChild(tabEl);

  const tabObj = {
    id: tabId,
    url: targetUrl,
    title: 'New Tab',
    webview: viewEl,
    tabEl
  };

  tabs.push(tabObj);

  // Attach Listeners
  if (isElectron) {
    viewEl.addEventListener('page-title-updated', (e) => {
      tabObj.title = e.title;
      tabEl.querySelector('.tab-title').innerText = e.title || 'Untitled';
      if (activeTabId === tabId) {
        document.title = `${e.title} - Nova Browser`;
      }
    });

    viewEl.addEventListener('did-navigate', (e) => {
      tabObj.url = e.url;
      if (activeTabId === tabId) {
        addressBar.value = e.url;
      }
    });

    viewEl.addEventListener('did-navigate-in-page', (e) => {
      tabObj.url = e.url;
      if (activeTabId === tabId) {
        addressBar.value = e.url;
      }
    });

    viewEl.addEventListener('did-start-loading', () => {
      if (activeTabId === tabId && !currentTaskRunning) {
        statusLabel.innerText = 'Loading page...';
        statusRing.className = 'status-indicator-ring';
      }
    });

    viewEl.addEventListener('did-stop-loading', () => {
      if (activeTabId === tabId && !currentTaskRunning) {
        statusLabel.innerText = 'Ready';
        statusRing.className = 'status-indicator-ring idle';
      }
    });
  } else {
    // Web iframe listeners
    viewEl.onload = () => {
      try {
        if (viewEl.contentDocument && viewEl.contentDocument.title) {
          tabObj.title = viewEl.contentDocument.title;
          tabEl.querySelector('.tab-title').innerText = viewEl.contentDocument.title;
          if (activeTabId === tabId) {
            document.title = `${viewEl.contentDocument.title} - Nova Browser`;
          }
        }
      } catch(e) {}
      if (activeTabId === tabId && !currentTaskRunning) {
        statusLabel.innerText = 'Ready';
        statusRing.className = 'status-indicator-ring idle';
      }
    };
  }

  switchTab(tabId);
  return tabObj;
}

function switchTab(tabId) {
  const target = tabs.find(t => t.id === tabId);
  if (!target) return;

  activeTabId = tabId;

  // Update tab strip classes
  tabs.forEach(t => {
    if (t.id === tabId) {
      t.tabEl.classList.add('active');
      t.webview.classList.add('active');
    } else {
      t.tabEl.classList.remove('active');
      t.webview.classList.remove('active');
    }
  });

  // Update address bar
  addressBar.value = target.url || 'about:blank';
  document.title = `${target.title || 'Nova'} - Nova Browser`;

  // Update agent execution context
  updateAgentContext();
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  const tabObj = tabs[index];
  tabObj.webview.remove();
  tabObj.tabEl.remove();
  tabs.splice(index, 1);

  if (tabs.length === 0) {
    createTab('https://www.google.com');
  } else if (activeTabId === tabId) {
    const nextTab = tabs[Math.max(0, index - 1)];
    switchTab(nextTab.id);
  }
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

// =========================================================================
// Omnibox & Navigation Controls
// =========================================================================

function navigateActiveTab(input) {
  const active = getActiveTab();
  if (!active) return;

  const parsed = parseOmniboxInput(input);
  active.url = parsed.url;
  addressBar.value = parsed.url;

  if (isElectron && typeof active.webview.loadURL === 'function') {
    active.webview.loadURL(parsed.url);
  } else if (isElectron) {
    active.webview.src = parsed.url;
  } else {
    active.webview.src = parsed.url.startsWith('/') || parsed.url === 'about:blank' ? parsed.url : `/proxy?url=${encodeURIComponent(parsed.url)}`;
  }
}

addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    navigateActiveTab(addressBar.value);
  }
});

goBtn.addEventListener('click', () => {
  navigateActiveTab(addressBar.value);
});

backBtn.addEventListener('click', () => {
  const active = getActiveTab();
  if (active && active.webview.canGoBack()) active.webview.goBack();
});

forwardBtn.addEventListener('click', () => {
  const active = getActiveTab();
  if (active && active.webview.canGoForward()) active.webview.goForward();
});

reloadBtn.addEventListener('click', () => {
  const active = getActiveTab();
  if (active) active.webview.reload();
});

newTabBtn.addEventListener('click', () => {
  createTab('https://www.google.com');
});

// =========================================================================
// AI Browser Agent Initialization & Context
// =========================================================================

function initBrowserAgent() {
  const options = {
    aiConfig: {
      geminiApiKey: localStorage.getItem('nova_gemini_key') || '',
      openaiApiKey: localStorage.getItem('nova_openai_key') || '',
      model: localStorage.getItem('nova_model') || 'gemini-2.0-flash'
    },
    onRequestPermission: async (req) => {
      return new Promise((resolve) => {
        pendingPermissionPromiseResolve = resolve;
        permissionMessage.innerText = req.message || req.reason;
        permissionModal.classList.remove('hidden');
      });
    },
    onTaskEvent: (evt) => {
      handleTaskEvent(evt);
    }
  };

  if (window.NovaAgent && window.NovaAgent.BrowserAgent) {
    browserAgent = new window.NovaAgent.BrowserAgent(options);
  } else if (window.novaAPI && window.novaAPI.createAgent) {
    browserAgent = window.novaAPI.createAgent(options);
  }

  updateAgentContext();
}

function updateAgentContext() {
  if (!browserAgent) return;

  browserAgent.setExecutionContext({
    executeScript: async (code) => {
      const active = getActiveTab();
      if (!active || !active.webview) return { error: 'No active tab' };
      try {
        if (isElectron && typeof active.webview.executeJavaScript === 'function') {
          return await active.webview.executeJavaScript(code);
        } else if (!isElectron && active.webview.contentWindow) {
          try {
            return active.webview.contentWindow.eval(code);
          } catch(err) {
            return { error: err.message };
          }
        }
        return { error: 'executeScript not available' };
      } catch (err) {
        console.warn('executeJavaScript notice:', err.message);
        return { error: err.message };
      }
    },
    navigateTab: async (url) => {
      const active = getActiveTab();
      if (!active || !active.webview) return false;
      active.url = url;
      addressBar.value = url;

      if (isElectron && typeof active.webview.loadURL === 'function') {
        active.webview.loadURL(url);
      } else if (isElectron) {
        active.webview.src = url;
      } else {
        active.webview.src = url.startsWith('/') || url === 'about:blank' ? url : `/proxy?url=${encodeURIComponent(url)}`;
      }

      await new Promise(r => setTimeout(r, 2200));
      return true;
    },
    createTab: async (url) => {
      const newTab = createTab(url);
      await new Promise(r => setTimeout(r, 2000));
      return newTab;
    },
    closeTab: async () => {
      if (activeTabId) closeTab(activeTabId);
      return true;
    },
    goBack: async () => {
      const active = getActiveTab();
      if (active && isElectron && typeof active.webview.canGoBack === 'function' && active.webview.canGoBack()) {
        active.webview.goBack();
      } else if (active && !isElectron && active.webview.contentWindow) {
        active.webview.contentWindow.history.back();
      }
      return true;
    },
    goForward: async () => {
      const active = getActiveTab();
      if (active && isElectron && typeof active.webview.canGoForward === 'function' && active.webview.canGoForward()) {
        active.webview.goForward();
      } else if (active && !isElectron && active.webview.contentWindow) {
        active.webview.contentWindow.history.forward();
      }
      return true;
    },
    reload: async () => {
      const active = getActiveTab();
      if (active && isElectron && typeof active.webview.reload === 'function') {
        active.webview.reload();
      } else if (active && !isElectron && active.webview.contentWindow) {
        active.webview.contentWindow.location.reload();
      }
      return true;
    },
    openApp: async (appName) => {
      if (window.novaAPI && window.novaAPI.system) {
        return await window.novaAPI.system.openApp(appName);
      }
      return { success: true, appName, simulated: true };
    },
    openFolder: async (folderName) => {
      if (window.novaAPI && window.novaAPI.system) {
        return await window.novaAPI.system.openFolder(folderName);
      }
      return { success: true, folderName, simulated: true };
    },
    openFile: async (filePath) => {
      if (window.novaAPI && window.novaAPI.system) {
        return await window.novaAPI.system.openFile(filePath);
      }
      return { success: true, filePath, simulated: true };
    },
    handlePower: async (mode) => {
      if (window.novaAPI && window.novaAPI.system) {
        return await window.novaAPI.system.handlePower(mode);
      }
      return { success: true, mode, simulated: true };
    },
    handleVolume: async (mode, level) => {
      if (window.novaAPI && window.novaAPI.system) {
        return await window.novaAPI.system.handleVolume(mode, level);
      }
      return { success: true, mode, level, simulated: true };
    }
  });
}

// =========================================================================
// AI Task Execution & Live Feed
// =========================================================================

async function executeAICommand(commandText) {
  if (!commandText || !commandText.trim()) return;
  const command = commandText.trim();
  aiCommandInput.value = '';

  currentTaskRunning = true;
  abortTaskBtn.classList.remove('hidden');
  statusRing.className = 'status-indicator-ring';

  // Ensure sidebar is open so user sees reasoning
  activitySidebar.classList.remove('collapsed');
  togglePanelBtn.classList.add('active');

  addFeedItem('command', `User: "${command}"`);

  if (browserAgent) {
    updateAgentContext();
    await browserAgent.executeCommand(command);
  } else if (window.novaAPI && window.novaAPI.sendCommand) {
    await window.novaAPI.sendCommand(command);
  }

  currentTaskRunning = false;
  abortTaskBtn.classList.add('hidden');
  statusRing.className = 'status-indicator-ring idle';
}

aiSubmitBtn.addEventListener('click', () => {
  executeAICommand(aiCommandInput.value);
});

aiCommandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    executeAICommand(aiCommandInput.value);
  }
});

abortTaskBtn.addEventListener('click', () => {
  if (browserAgent) {
    browserAgent.abort();
  }
});

// Event Handler from TaskManager
function handleTaskEvent(evt) {
  const { type } = evt;

  switch (type) {
    case 'task_started':
      statusLabel.innerText = evt.status || 'Understanding request...';
      statusSub.innerText = `Command: "${evt.command}"`;
      break;

    case 'planning':
      statusLabel.innerText = evt.status;
      break;

    case 'plan_created':
      renderPlan(evt);
      addFeedItem('plan', `Plan created: ${evt.goal} (${evt.stepCount} steps)`);
      break;

    case 'step_started':
      statusLabel.innerText = evt.status;
      statusSub.innerText = `Action: ${evt.step.action} ${evt.step.target || evt.step.url || ''}`;
      highlightCurrentStep(evt.stepIndex);
      addFeedItem('action', `Step ${evt.stepNumber}: ${evt.step.action} ${evt.step.target || evt.step.url || ''}`);
      break;

    case 'step_progress':
      statusSub.innerText = evt.status;
      break;

    case 'step_completed':
      markStepCompleted(evt.stepIndex);
      break;

    case 'step_failed':
      addFeedItem('error', `Step warning: ${evt.error}`);
      break;

    case 'verifying':
      statusLabel.innerText = evt.status;
      break;

    case 'task_completed':
      statusLabel.innerText = 'Task Completed';
      statusSub.innerText = evt.reason;
      addFeedItem('success', `Done: ${evt.reason}`);
      break;

    case 'task_completed_warning':
      statusLabel.innerText = 'Completed with note';
      statusSub.innerText = evt.reason;
      addFeedItem('warning', evt.reason);
      break;

    case 'task_failed':
      statusLabel.innerText = 'Task Failed';
      statusSub.innerText = evt.error;
      addFeedItem('error', `Failed: ${evt.error}`);
      break;

    case 'task_aborted':
      statusLabel.innerText = 'Task Cancelled';
      statusSub.innerText = evt.message;
      addFeedItem('warning', evt.message);
      break;
  }
}

function renderPlan(planData) {
  planCard.classList.remove('hidden');
  planGoal.innerText = planData.goal;
  planStepsCount.innerText = `${planData.stepCount} steps`;
  stepsList.innerHTML = '';

  planData.steps.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = 'step-row';
    row.id = 'stepRow_' + idx;
    row.innerHTML = `
      <span class="step-bullet">${idx + 1}</span>
      <span>${step.action}: ${step.target || step.url || step.query || step.appName || ''}</span>
    `;
    stepsList.appendChild(row);
  });
}

function highlightCurrentStep(stepIndex) {
  document.querySelectorAll('.step-row').forEach((r, idx) => {
    if (idx === stepIndex) r.classList.add('current');
    else r.classList.remove('current');
  });
}

function markStepCompleted(stepIndex) {
  const row = document.getElementById('stepRow_' + stepIndex);
  if (row) {
    row.classList.remove('current');
    row.classList.add('completed');
  }
}

function addFeedItem(type, message) {
  const placeholder = activityFeed.querySelector('.feed-placeholder');
  if (placeholder) placeholder.remove();

  const item = document.createElement('div');
  item.className = 'feed-item';
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.innerHTML = `
    <div class="feed-item-header">
      <span class="feed-item-type">${type}</span>
      <span class="feed-item-time">${time}</span>
    </div>
    <div class="feed-item-msg">${escapeHtml(message)}</div>
  `;

  activityFeed.appendChild(item);
  activityFeed.scrollTop = activityFeed.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// Sample command chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    executeAICommand(chip.innerText);
  });
});

// Clear activity log
clearLogBtn.addEventListener('click', () => {
  activityFeed.innerHTML = `
    <div class="feed-placeholder">
      <div class="placeholder-icon">🤖</div>
      <p>Nova is waiting for your command.</p>
    </div>
  `;
  planCard.classList.add('hidden');
  statusLabel.innerText = 'Ready for instructions';
  statusSub.innerText = 'Type a command or speak below';
});

// Sidebar Toggle
togglePanelBtn.addEventListener('click', () => {
  activitySidebar.classList.toggle('collapsed');
  togglePanelBtn.classList.toggle('active');
});

closeSidebarBtn.addEventListener('click', () => {
  activitySidebar.classList.add('collapsed');
  togglePanelBtn.classList.remove('active');
});

// =========================================================================
// Voice Input Integration (Web Speech API)
// =========================================================================

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.title = 'Speech Recognition not supported in this environment';
    return;
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = false;
  speechRecognizer.interimResults = true;
  speechRecognizer.lang = 'en-US';

  speechRecognizer.onstart = () => {
    isVoiceRecording = true;
    voiceBtn.classList.add('recording');
    aiCommandInput.placeholder = 'Listening... (Speak your command)';
  };

  speechRecognizer.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    aiCommandInput.value = transcript;
  };

  speechRecognizer.onend = () => {
    isVoiceRecording = false;
    voiceBtn.classList.remove('recording');
    aiCommandInput.placeholder = 'Ask Nova to do anything...';
    if (aiCommandInput.value.trim()) {
      executeAICommand(aiCommandInput.value);
    }
  };

  speechRecognizer.onerror = (e) => {
    isVoiceRecording = false;
    voiceBtn.classList.remove('recording');
    console.warn('Speech recognition error:', e.error);
  };

  voiceBtn.addEventListener('click', () => {
    if (isVoiceRecording) {
      speechRecognizer.stop();
    } else {
      speechRecognizer.start();
    }
  });
}

// =========================================================================
// Permission & Settings Modals
// =========================================================================

allowPermissionBtn.addEventListener('click', () => {
  permissionModal.classList.add('hidden');
  if (pendingPermissionPromiseResolve) {
    pendingPermissionPromiseResolve(true);
    pendingPermissionPromiseResolve = null;
  }
});

denyPermissionBtn.addEventListener('click', () => {
  permissionModal.classList.add('hidden');
  if (pendingPermissionPromiseResolve) {
    pendingPermissionPromiseResolve(false);
    pendingPermissionPromiseResolve = null;
  }
});

settingsBtn.addEventListener('click', () => {
  geminiKeyInput.value = localStorage.getItem('nova_gemini_key') || '';
  openaiKeyInput.value = localStorage.getItem('nova_openai_key') || '';
  modelSelect.value = localStorage.getItem('nova_model') || 'gemini-2.0-flash';
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
  const gemini = geminiKeyInput.value.trim();
  const openai = openaiKeyInput.value.trim();
  const model = modelSelect.value;

  localStorage.setItem('nova_gemini_key', gemini);
  localStorage.setItem('nova_openai_key', openai);
  localStorage.setItem('nova_model', model);

  if (browserAgent) {
    browserAgent.updateConfig({
      geminiApiKey: gemini,
      openaiApiKey: openai,
      model
    });
  }

  settingsModal.classList.add('hidden');
  addFeedItem('system', 'Settings updated successfully.');
});

// =========================================================================
// App Bootstrap
// =========================================================================

function bootstrap() {
  createTab('https://www.google.com');
  initBrowserAgent();
  setupVoiceInput();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
