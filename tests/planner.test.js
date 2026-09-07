const assert = require('assert');
const { TaskPlanner } = require('../src/ai/planner');
const { AIProvider } = require('../src/ai/aiProvider');

async function runTests() {
  console.log('🧪 Running TaskPlanner Tests...');
  const provider = new AIProvider();
  const planner = new TaskPlanner(provider);

  // Test 1: "Open YouTube"
  {
    const plan = await planner.planTask({ command: 'Open YouTube' });
    assert.strictEqual(plan.steps[0].action, 'navigate');
    assert.ok(plan.steps[0].url.includes('youtube.com'));
    console.log('  ✅ Test 1 Passed: "Open YouTube" generates navigation plan');
  }

  // Test 2: "Search YouTube for Kesariya"
  {
    const plan = await planner.planTask({ command: 'Search YouTube for Kesariya' });
    assert.strictEqual(plan.steps[0].action, 'navigate');
    assert.ok(plan.steps[0].url.includes('youtube.com/results?search_query=Kesariya'));
    console.log('  ✅ Test 2 Passed: "Search YouTube for Kesariya" generates search plan');
  }

  // Test 3: "Play Kesariya on YouTube"
  {
    const plan = await planner.planTask({ command: 'Play Kesariya on YouTube' });
    assert.ok(plan.steps.some(s => s.action === 'click'));
    assert.ok(plan.steps.some(s => s.action === 'play'));
    console.log('  ✅ Test 3 Passed: "Play Kesariya on YouTube" generates play sequence');
  }

  // Test 4: "Open Google"
  {
    const plan = await planner.planTask({ command: 'Open Google' });
    assert.strictEqual(plan.steps[0].action, 'navigate');
    assert.ok(plan.steps[0].url.includes('google.com'));
    console.log('  ✅ Test 4 Passed: "Open Google" generates google navigation');
  }

  // Test 5: "Search Google for Python tutorials"
  {
    const plan = await planner.planTask({ command: 'Search Google for Python tutorials' });
    assert.strictEqual(plan.steps[0].action, 'navigate');
    assert.ok(plan.steps[0].url.includes('google.com/search?q=Python%20tutorials'));
    console.log('  ✅ Test 5 Passed: "Search Google for Python tutorials" generates search');
  }

  // Test 6: "Open the first result"
  {
    const plan = await planner.planTask({ command: 'Open the first result' });
    assert.strictEqual(plan.steps[0].action, 'click');
    assert.strictEqual(plan.steps[0].resultIndex, 1);
    console.log('  ✅ Test 6 Passed: "Open the first result" resolves resultIndex 1');
  }

  // Test 7: "Open the second result"
  {
    const plan = await planner.planTask({ command: 'Open the second result' });
    assert.strictEqual(plan.steps[0].action, 'click');
    assert.strictEqual(plan.steps[0].resultIndex, 2);
    console.log('  ✅ Test 7 Passed: "Open the second result" resolves resultIndex 2');
  }

  // Test 8: "Go back"
  {
    const plan = await planner.planTask({ command: 'Go back' });
    assert.strictEqual(plan.steps[0].action, 'go_back');
    console.log('  ✅ Test 8 Passed: "Go back" generates go_back action');
  }

  // Test 9: "Open GitHub in a new tab"
  {
    const plan = await planner.planTask({ command: 'Open GitHub in a new tab' });
    assert.strictEqual(plan.steps[0].action, 'new_tab');
    assert.ok(plan.steps[0].url.includes('github.com'));
    console.log('  ✅ Test 9 Passed: "Open GitHub in a new tab" generates new_tab action');
  }

  // Test 10: "Search GitHub for machine learning projects"
  {
    const plan = await planner.planTask({ command: 'Search GitHub for machine learning projects' });
    assert.strictEqual(plan.steps[0].action, 'navigate');
    assert.ok(plan.steps[0].url.includes('github.com/search?q=machine%20learning%20projects'));
    console.log('  ✅ Test 10 Passed: "Search GitHub for machine learning projects"');
  }

  // Test 11: Complex compound command
  {
    const plan = await planner.planTask({ command: 'Open YouTube, search for Arijit Singh, and play the first result' });
    assert.ok(plan.steps.length >= 3);
    assert.ok(plan.steps.some(s => s.action === 'navigate'));
    assert.ok(plan.steps.some(s => s.action === 'click'));
    console.log('  ✅ Test 11 Passed: Complex multi-step compound instruction planning');
  }

  // Test 12: "Turn off my laptop"
  {
    const plan = await planner.planTask({ command: 'Turn off my laptop' });
    assert.strictEqual(plan.steps[0].action, 'system_power');
    assert.strictEqual(plan.steps[0].mode, 'shutdown');
    assert.strictEqual(plan.requiresConfirmation, true);
    console.log('  ✅ Test 12 Passed: "Turn off my laptop" generates power shutdown with confirmation');
  }

  // Test 13: "Put my laptop to sleep"
  {
    const plan = await planner.planTask({ command: 'Put my laptop to sleep' });
    assert.strictEqual(plan.steps[0].action, 'system_power');
    assert.strictEqual(plan.steps[0].mode, 'sleep');
    console.log('  ✅ Test 13 Passed: "Put my laptop to sleep" generates sleep mode');
  }

  // Test 14: "Open file resume.pdf"
  {
    const plan = await planner.planTask({ command: 'Open file resume.pdf' });
    assert.strictEqual(plan.steps[0].action, 'open_file');
    assert.strictEqual(plan.steps[0].fileName, 'resume.pdf');
    console.log('  ✅ Test 14 Passed: "Open file resume.pdf" generates open_file action');
  }

  // Test 15: "Open Visual Studio Code"
  {
    const plan = await planner.planTask({ command: 'Open Visual Studio Code' });
    assert.strictEqual(plan.steps[0].action, 'open_application');
    console.log('  ✅ Test 15 Passed: "Open Visual Studio Code" generates open_application');
  }

  // Test 16: "Open Downloads folder"
  {
    const plan = await planner.planTask({ command: 'Open Downloads folder' });
    assert.strictEqual(plan.steps[0].action, 'open_folder');
    console.log('  ✅ Test 16 Passed: "Open Downloads folder" generates open_folder');
  }

  // Test 17: "Set volume to 80%"
  {
    const plan = await planner.planTask({ command: 'Set volume to 80%' });
    assert.strictEqual(plan.steps[0].action, 'system_volume');
    assert.strictEqual(plan.steps[0].mode, 'set');
    assert.strictEqual(plan.steps[0].level, 80);
    console.log('  ✅ Test 17 Passed: "Set volume to 80%" generates system_volume action');
  }

  console.log('🎉 All TaskPlanner tests passed!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
