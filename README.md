# ✦ Nova Browser - Autonomous AI Browser Agent

Nova Browser is a general-purpose, autonomous AI browser desktop application built with Electron. Rather than relying on rigid, hardcoded website macros or simulated screenshots, Nova understands natural language requests, formulates dynamic multi-step action plans, interacts with real web content in real-time, inspects DOM elements and accessibility semantics, self-corrects from failures, and verifies actual task success.

---

## 🌟 Key Features

- **Autonomous Agent Loop**:
  $$\text{User Request} \longrightarrow \text{Understanding} \longrightarrow \text{Dynamic Plan} \longrightarrow \text{Execution} \longrightarrow \text{Page Observation} \longrightarrow \text{Verification} \longrightarrow \text{Report}$$
- **Real Browser Engine**: Multi-tab browsing powered by Electron with real DOM rendering, address bar omnibox, and navigation history.
- **Smart Natural Language Understanding**:
  - Direct actions: *"Open YouTube"*, *"Go to github.com"*
  - Media playback: *"Play Kesariya on YouTube"*, *"Search YouTube for Arijit Singh songs and play the first result"*
  - Research & Search: *"Search Google for Python tutorials and open the first result"*, *"Search GitHub for machine learning projects"*
  - Contextual & Relative References: *"Open the second result"*, *"Find beginner on page"*
  - Tab & Navigation control: *"Open a new tab and search for weather"*, *"Go back"*, *"Reload page"*
- **Live Activity Feed & Status Ticker**: Real-time transparency showing AI thoughts, step-by-step progress, DOM inspection, and verification status.
- **Human-in-the-Loop Permission System**: Sensitive actions (external email sending, financial checkout, data deletion) trigger explicit approval modals.
- **Voice Command Support**: Built-in speech-to-text input interface via the Web Speech API.
- **Safe Computer Control**: Controlled tool registry for launching desktop applications and opening folders without unrestricted shell execution.
- **Modular AI Providers**: Works out of the box with zero configuration using the built-in intelligent dynamic planner, and also supports Google Gemini (e.g. `gemini-2.0-flash`, `gemini-1.5-pro`) and OpenAI (`gpt-4o`, `gpt-4o-mini`).

---

## 📋 Prerequisites

- **Node.js**: `v18.0.0` or later (tested on Node v20/v22/v26)
- **npm**: `v9.0.0` or later
- **Operating System**: macOS, Windows 10/11, or Linux

---

## 🚀 Installation & Setup

1. **Clone or Navigate to the project directory**:
   ```bash
   cd /Users/muskansah/.gemini/antigravity/scratch/nova-browser
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure API Keys (Optional)**:
   Nova includes an intelligent built-in dynamic planner that works immediately without any API keys. If you wish to use Google Gemini or OpenAI LLMs:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Add your API keys to `.env`:
     ```ini
     GEMINI_API_KEY=your_gemini_api_key_here
     OPENAI_API_KEY=your_openai_api_key_here
     AI_MODEL=gemini-2.0-flash
     ```
   - Alternatively, you can enter or change your keys directly in the app via the **Settings (⚙️)** modal.

---

## 💻 Running the Application

### Development Mode
```bash
npm start
```
Or with verbose logging:
```bash
npm run dev
```

### Running Automated Test Suites
Run all agent, planner, and verifier unit and integration tests:
```bash
npm test
```

---

## 📦 Production Build

To package Nova Browser into a standalone desktop application:

1. Install `electron-builder` or `electron-packager`:
   ```bash
   npm install --save-dev electron-builder
   ```
2. Build for your platform:
   - **macOS**: `npx electron-builder --mac`
   - **Windows**: `npx electron-builder --win`
   - **Linux**: `npx electron-builder --linux`

---

## 📁 Project Architecture

```
nova-browser/
├── package.json               # Project manifest and test scripts
├── main.js                    # Electron main process & IPC handlers
├── preload.js                 # Context-isolated secure preload bridge
├── .env.example               # Environment configuration template
├── README.md                  # Comprehensive documentation
│
├── src/
│   ├── renderer/              # Modern desktop UI
│   │   ├── index.html         # Omnibox, Tabs, Viewport, AI Command Bar & Drawer
│   │   ├── styles.css         # Arc/Modern glassmorphic dark theme
│   │   └── renderer.js        # Tab/Webview controller & Voice recognition
│   │
│   ├── ai/                    # Modular AI Engine
│   │   ├── aiProvider.js      # Gemini / OpenAI API & local dynamic planner
│   │   ├── commandParser.js   # Intent & compound command decomposition
│   │   ├── planner.js         # Dynamic multi-step task generator
│   │   └── prompts.js         # AI system prompts and schemas
│   │
│   ├── agent/                 # Autonomous Agent Orchestrator
│   │   ├── browserAgent.js    # Unified BrowserAgent entrypoint
│   │   ├── taskManager.js     # Agent lifecycle loop & memory
│   │   ├── actionExecutor.js  # Action primitives with robust retries
│   │   ├── actionRegistry.js  # Action schemas and risk policies
│   │   └── verifier.js        # Multi-criteria task verification
│   │
│   ├── browser/               # Browser & DOM Inspection
│   │   ├── pageObserver.js    # Injected DOM analyzer & element highlighter
│   │   └── navigation.js      # URL normalization & omnibox heuristics
│   │
│   ├── computer/              # Controlled OS Tools
│   │   └── computerController.js # Safe application and folder launcher
│   │
│   └── config/
│       └── websites.js        # Service endpoints & search URL generators
│
└── tests/                     # Test Suites
    ├── agent.test.js          # E2E Agent lifecycle & permission tests
    ├── planner.test.js        # Multi-step planning tests
    └── verifier.test.js       # Success/failure verification tests
```

---

## 🛠️ Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Electron window does not display webviews** | `webviewTag` disabled | Ensure `webPreferences: { webviewTag: true }` is enabled in `main.js`. |
| **Microphone / Voice input does not activate** | OS permissions | Grant Microphone permission to Electron / Terminal in OS System Settings. |
| **API key errors** | Invalid or expired key | Check `.env` file or update key in the in-app Settings modal. |
| **Page elements fail to click** | Dynamic SPA hydration | ActionExecutor includes automatic 1.5s re-observation and retry fallback. |

---

## 🛡️ Security

- **Context Isolation**: Enabled (`contextIsolation: true`).
- **Node Integration in Web Content**: Disabled (`nodeIntegration: false`).
- **No Unrestricted Shell Access**: Computer actions are restricted to a strictly validated whitelist of safe applications and folders.
- **Sensitive Operations**: Gated by a human confirmation dialog.

---

## 📄 License
MIT License.
