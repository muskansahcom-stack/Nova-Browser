const assert = require('assert');
const { TaskVerifier } = require('../src/agent/verifier');

async function runTests() {
  console.log('🧪 Running TaskVerifier Tests...');

  // Test 1: Navigation verification
  {
    const res = TaskVerifier.verify({
      command: 'Open GitHub',
      goal: 'Open GitHub',
      actionsTaken: [{ step: { action: 'navigate' }, result: { success: true } }],
      finalState: { url: 'https://github.com', title: 'GitHub: Let’s build from here' }
    });
    assert.strictEqual(res.success, true);
    console.log('  ✅ Test 1 Passed: Verifies GitHub navigation');
  }

  // Test 2: Error page rejection (Do not claim false success)
  {
    const res = TaskVerifier.verify({
      command: 'Open broken site',
      goal: 'Open broken site',
      actionsTaken: [{ step: { action: 'navigate' }, result: { success: true } }],
      finalState: { url: 'chrome-error://chromewebdata/', title: 'Site can’t be reached' }
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('Failed to load'));
    console.log('  ✅ Test 2 Passed: Correctly detects error page and refuses false success');
  }

  // Test 3: YouTube video playback verification
  {
    const res = TaskVerifier.verify({
      command: 'Play Kesariya on YouTube',
      goal: 'Play Kesariya',
      actionsTaken: [{ step: { action: 'play' }, result: { success: true } }],
      finalState: {
        url: 'https://www.youtube.com/watch?v=BddP6PYo2gs',
        title: 'Kesariya - Brahmāstra',
        media: { isPlaying: true, hasVideo: true }
      },
      verificationCriteria: { expectedMediaType: 'video' }
    });
    assert.strictEqual(res.success, true);
    console.log('  ✅ Test 3 Passed: Verifies video playback on YouTube');
  }

  // Test 4: Search results verification
  {
    const res = TaskVerifier.verify({
      command: 'Search Google for Python tutorials',
      goal: 'Search Google for Python tutorials',
      actionsTaken: [{ step: { action: 'navigate' }, result: { success: true } }],
      finalState: {
        url: 'https://www.google.com/search?q=Python+tutorials',
        title: 'Python tutorials - Google Search',
        searchResults: [{ title: 'Python Tutorial - W3Schools', href: 'https://w3schools.com' }]
      }
    });
    assert.strictEqual(res.success, true);
    console.log('  ✅ Test 4 Passed: Verifies search results presence');
  }

  console.log('🎉 All TaskVerifier tests passed!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
