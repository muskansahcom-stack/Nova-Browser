/**
 * Website helpers and URL normalizers for Nova Browser
 * Used for URL heuristics and search engine integrations
 */

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
    domain: 'amazon.in', // or amazon.com based on query/locale
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

/**
 * Normalizes input string to a valid URL or search query
 * @param {string} input 
 * @returns {{ isUrl: boolean, url: string, query?: string }}
 */
function parseOmniboxInput(input) {
  if (!input || typeof input !== 'string') {
    return { isUrl: true, url: 'about:blank' };
  }

  const trimmed = input.trim();

  // Explicit protocols
  if (/^https?:\/\//i.test(trimmed) || /^about:/i.test(trimmed) || /^file:\/\//i.test(trimmed)) {
    return { isUrl: true, url: trimmed };
  }

  // Common domain pattern (e.g., github.com, example.org/path, localhost:3000)
  const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/;
  const localhostPattern = /^localhost(:\d+)?(\/.*)?$/;

  if (domainPattern.test(trimmed) || localhostPattern.test(trimmed)) {
    return { isUrl: true, url: `https://${trimmed}` };
  }

  // Service shortcuts (e.g. "youtube", "github", "gmail")
  const lower = trimmed.toLowerCase();
  if (KNOWN_SERVICES[lower]) {
    return { isUrl: true, url: KNOWN_SERVICES[lower].home };
  }

  // Treat as search query
  return {
    isUrl: false,
    url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
    query: trimmed
  };
}

module.exports = {
  KNOWN_SERVICES,
  parseOmniboxInput
};
