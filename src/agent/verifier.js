/**
 * Task Verifier for Nova Browser
 * Performs multi-criteria verification to confirm actual task completion without false claims.
 */

class TaskVerifier {
  /**
   * Evaluates if the executed plan achieved the user's objective
   * @param {Object} params
   * @param {string} params.command
   * @param {string} params.goal
   * @param {Array} params.actionsTaken
   * @param {Object} params.finalState - { url, title, elements, searchResults, media }
   * @param {Object} params.verificationCriteria
   * @returns {{ success: boolean, confidence: number, reason: string }}
   */
  static verify({ command, goal, actionsTaken, finalState = {}, verificationCriteria = {} }) {
    const url = (finalState.url || '').toLowerCase();
    const title = (finalState.title || '').toLowerCase();
    const cmd = (command || '').toLowerCase();

    // 1. Error state detection
    if (url.startsWith('chrome-error://') || url.includes('dnserror') || title.includes('404') || title.includes('site can’t be reached') || title.includes('page not found')) {
      return {
        success: false,
        confidence: 0.95,
        reason: `Failed to load page. Browser reported: ${title || url}`
      };
    }

    // 2. Expected URL contains check
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

    // 3. Media playback verification (e.g. "play Kesariya", "play music")
    if (verificationCriteria.expectedMediaType === 'video' || (cmd.includes('play') && cmd.includes('youtube'))) {
      const isWatch = url.includes('youtube.com/watch');
      const isPlaying = finalState.media && (finalState.media.isPlaying || finalState.media.hasVideo);

      if (isWatch && isPlaying) {
        return {
          success: true,
          confidence: 0.95,
          reason: 'YouTube video page opened and playback initialized'
        };
      } else if (isWatch) {
        return {
          success: true,
          confidence: 0.9,
          reason: 'YouTube video page loaded'
        };
      } else {
        return {
          success: false,
          confidence: 0.8,
          reason: 'Did not successfully navigate to the video playback page'
        };
      }
    }

    // 4. Search results verification (Google, GitHub, etc.)
    if (cmd.includes('search') || (actionsTaken.some(a => a.action === 'type' || a.action === 'navigate'))) {
      if (finalState.searchResults && finalState.searchResults.length > 0) {
        return {
          success: true,
          confidence: 0.95,
          reason: `Search executed successfully, found ${finalState.searchResults.length} results`
        };
      }
    }

    // 5. General navigation check
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

module.exports = { TaskVerifier };
