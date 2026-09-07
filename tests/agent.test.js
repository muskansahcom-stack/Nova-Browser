const assert = require('assert');
const { BrowserAgent } = require('../src/agent/browserAgent');

async function runTests() {
  console.log('🧪 Running BrowserAgent End-to-End Orchestration Tests...');

  let events = [];
  let navigatedUrl = '';
  let activeTabUrl = 'about:blank';
  let tabsCount = 1;

  const agent = new BrowserAgent({
    onTaskEvent: (evt) => {
      events.push(evt);
    },
    executorContext: {
      navigateTab: async (url) => {
        navigatedUrl = url;
        activeTabUrl = url;
        return true;
      },
      createTab: async (url) => {
        tabsCount++;
        activeTabUrl = url;
        return { id: tabsCount, url };
      },
      closeTab: async () => {
        tabsCount--;
        return true;
      },
      goBack: async () => true,
      goForward: async () => true,
      reload: async () => true,
      executeScript: async (script) => {
        if (script.includes('window.location.href')) {
          return {
            url: activeTabUrl,
            title: activeTabUrl.includes('youtube') ? 'YouTube' : (activeTabUrl.includes('google') ? 'Google' : 'Test Page'),
            elements: [],
            searchResults: [{ title: 'Python 101', href: 'https://python.org' }]
          };
        }
        return { success: true };
      }
    }
  });

  // Test 1: Run "Open YouTube"
  {
    events = [];
    const res = await agent.executeCommand('Open YouTube');
    assert.strictEqual(res.success, true);
    assert.ok(navigatedUrl.includes('youtube.com'));
    assert.ok(events.some(e => e.type === 'task_started'));
    assert.ok(events.some(e => e.type === 'plan_created'));
    assert.ok(events.some(e => e.type === 'task_completed'));
    console.log('  ✅ Test 1 Passed: Executed "Open YouTube" with complete event stream');
  }

  // Test 2: Run "Open GitHub in a new tab"
  {
    events = [];
    const res = await agent.executeCommand('Open GitHub in a new tab');
    assert.strictEqual(res.success, true);
    assert.strictEqual(tabsCount, 2);
    assert.ok(activeTabUrl.includes('github.com'));
    console.log('  ✅ Test 2 Passed: Executed "Open GitHub in a new tab" with real tab creation');
  }

  // Test 3: Permission barrier for sensitive actions
  {
    let permissionPrompted = false;
    const guardedAgent = new BrowserAgent({
      onRequestPermission: async (req) => {
        permissionPrompted = true;
        return false; // User denies
      },
      onTaskEvent: () => {}
    });

    const res = await guardedAgent.executeCommand('Send an email to team with update');
    assert.strictEqual(permissionPrompted, true);
    assert.strictEqual(res.success, false);
    console.log('  ✅ Test 3 Passed: High-impact actions are safely gated behind permission prompts');
  }

  console.log('🎉 All BrowserAgent tests passed!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
