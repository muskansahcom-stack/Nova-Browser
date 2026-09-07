/**
 * Page Observer & DOM Inspection Utilities for Nova Browser
 * Extracts accessible elements, interactive controls, search results, and media status
 */

const OBSERVER_SCRIPT = `
(() => {
  try {
    // 1. Basic Page Meta
    const url = window.location.href;
    const title = document.title || '';

    // 2. Interactive Elements Extraction
    const interactiveElements = [];
    const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="searchbox"], [role="textbox"], video, [tabindex="0"]');

    let resultIndexCounter = 1;
    const searchResults = [];

    // Identify search results on Google, YouTube, GitHub, Amazon, etc.
    const isGoogle = url.includes('google.com/search');
    const isYouTube = url.includes('youtube.com');
    const isGitHub = url.includes('github.com/search');
    const isAmazon = url.includes('amazon.');

    // Heuristics for search results
    if (isGoogle) {
      document.querySelectorAll('#search .g a, #rso .g a, [data-sokoban-container] a').forEach(a => {
        const h3 = a.querySelector('h3');
        if (h3 && h3.innerText.trim() && !searchResults.some(r => r.href === a.href)) {
          searchResults.push({
            index: searchResults.length + 1,
            title: h3.innerText.trim(),
            href: a.href,
            selector: 'google_result_' + (searchResults.length + 1)
          });
        }
      });
    } else if (isYouTube) {
      document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer, #contents ytd-video-renderer').forEach(card => {
        const titleLink = card.querySelector('a#video-title, #video-title');
        if (titleLink && titleLink.innerText.trim()) {
          const href = titleLink.getAttribute('href') || (titleLink.closest('a') ? titleLink.closest('a').getAttribute('href') : '');
          if (href && !searchResults.some(r => r.title === titleLink.innerText.trim())) {
            searchResults.push({
              index: searchResults.length + 1,
              title: titleLink.innerText.trim(),
              href: href.startsWith('http') ? href : 'https://www.youtube.com' + href,
              selector: 'youtube_result_' + (searchResults.length + 1)
            });
          }
        }
      });
    } else if (isGitHub) {
      document.querySelectorAll('[data-testid="results-list"] a, .repo-list-item a, .search-title a').forEach(a => {
        const text = a.innerText.trim();
        if (text && a.href && a.href.includes('github.com/') && !searchResults.some(r => r.href === a.href)) {
          searchResults.push({
            index: searchResults.length + 1,
            title: text,
            href: a.href,
            selector: 'github_result_' + (searchResults.length + 1)
          });
        }
      });
    }

    elements.forEach((el, i) => {
      if (i > 150) return; // Cap to avoid overwhelming payload

      // Check visibility
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      if (!isVisible) return;

      const tagName = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || tagName;
      const type = el.getAttribute('type') || '';
      const text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '').trim().substring(0, 100);
      const name = el.getAttribute('name') || '';
      const id = el.id || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const ariaLabel = el.getAttribute('aria-label') || '';

      interactiveElements.push({
        id: id || undefined,
        tagName,
        type,
        role,
        text,
        placeholder: placeholder || undefined,
        ariaLabel: ariaLabel || undefined,
        name: name || undefined,
        href: el.href || undefined,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    });

    // 3. Media Status
    const videos = Array.from(document.querySelectorAll('video'));
    const isPlayingMedia = videos.some(v => !v.paused && !v.ended && v.readyState > 2);
    const mediaDuration = videos[0] ? videos[0].duration : 0;
    const mediaCurrentTime = videos[0] ? videos[0].currentTime : 0;

    return {
      url,
      title,
      interactiveCount: interactiveElements.length,
      elements: interactiveElements,
      searchResults,
      media: {
        hasVideo: videos.length > 0,
        isPlaying: isPlayingMedia,
        duration: mediaDuration,
        currentTime: mediaCurrentTime
      }
    };
  } catch (err) {
    return {
      error: err.message,
      url: window.location.href,
      title: document.title || ''
    };
  }
})();
`;

const HIGHLIGHT_ELEMENT_SCRIPT = (selectorOrText) => `
(() => {
  try {
    // Remove previous highlights
    document.querySelectorAll('.nova-element-highlight').forEach(el => el.remove());

    let target = null;
    const query = ${JSON.stringify(selectorOrText)};

    // Try finding by ID / direct selector
    if (query.startsWith('#') || query.startsWith('.')) {
      target = document.querySelector(query);
    }

    // Try finding by text or aria-label
    if (!target) {
      const candidates = document.querySelectorAll('button, a, input, [role="button"], h3, ytd-video-renderer');
      for (const el of candidates) {
        if (el.innerText && el.innerText.toLowerCase().includes(query.toLowerCase())) {
          target = el;
          break;
        }
        if (el.getAttribute('aria-label') && el.getAttribute('aria-label').toLowerCase().includes(query.toLowerCase())) {
          target = el;
          break;
        }
      }
    }

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect = target.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.className = 'nova-element-highlight';
      badge.style.position = 'fixed';
      badge.style.left = (rect.left - 4) + 'px';
      badge.style.top = (rect.top - 4) + 'px';
      badge.style.width = (rect.width + 8) + 'px';
      badge.style.height = (rect.height + 8) + 'px';
      badge.style.border = '3px solid #6366f1';
      badge.style.borderRadius = '8px';
      badge.style.boxShadow = '0 0 16px rgba(99, 102, 241, 0.6)';
      badge.style.pointerEvents = 'none';
      badge.style.zIndex = '9999999';
      badge.style.transition = 'all 0.3s ease';
      document.body.appendChild(badge);

      setTimeout(() => badge.remove(), 2500);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
})();
`;

module.exports = {
  OBSERVER_SCRIPT,
  HIGHLIGHT_ELEMENT_SCRIPT
};
