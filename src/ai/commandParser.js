/**
 * Command Parser for Nova Browser
 * Extracts intent, entities, compound instructions, and context references
 */

class CommandParser {
  /**
   * Splits compound natural language commands (e.g. "Open YouTube, search for X, and play the first result")
   * @param {string} text 
   * @returns {string[]}
   */
  static splitCompoundCommands(text) {
    if (!text || typeof text !== 'string') return [];
    
    const cleaned = text.trim();
    if (!cleaned) return [];

    // Replace explicit connectors with a standard delimiter '|~|'
    let normalized = cleaned
      .replace(/\s*,\s*and\s+then\s+/gi, '|~|')
      .replace(/\s*,\s*then\s+/gi, '|~|')
      .replace(/\s+and\s+then\s+/gi, '|~|')
      .replace(/\s+then\s+/gi, '|~|')
      .replace(/\s*;\s*/g, '|~|')
      .replace(/\s*,\s*and\s+/gi, '|~|');

    // Split by comma if the subsequent clause starts with an action verb
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
        // If not starting with action verb, join with previous part
        if (parts.length > 0) {
          parts[parts.length - 1] += ', ' + p;
        } else {
          parts.push(p);
        }
      }
    }

    return parts.map(s => s.trim()).filter(Boolean);
  }

  /**
   * Identifies relative contextual references (e.g. "the first result", "the 2nd one", "that video")
   * @param {string} text 
   */
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

  /**
   * Determines if a command is high-impact / sensitive
   * @param {string} text 
   * @returns {{ isSensitive: boolean, reason?: string }}
   */
  static checkSensitivity(text) {
    const sensitivePatterns = [
      { pattern: /\b(send\s+(?:an?\s+)?email|send\s+mail)\b/i, reason: 'Send email' },
      { pattern: /\b(send\s+(?:a\s+)?whatsapp\s+message|whatsapp)\b/i, reason: 'Send messaging chat' },
      { pattern: /\b(purchase|buy\s+now|checkout|pay\s+now|transfer\s+money)\b/i, reason: 'Financial / Purchase transaction' },
      { pattern: /\b(delete\s+(?:all\s+)?files?|remove\s+account|format\s+drive)\b/i, reason: 'Destructive deletion operation' },
      { pattern: /\b(submit\s+form|apply\s+now)\b/i, reason: 'External form submission' },
      { pattern: /\b(turn\s+off\s+(?:my\s+)?(?:laptop|pc|computer|system)|shutdown|shut\s+down|power\s+off)\b/i, reason: 'Shut down laptop / computer' },
      { pattern: /\b(restart\s+(?:my\s+)?(?:laptop|pc|computer|system)|reboot)\b/i, reason: 'Restart laptop / computer' }
    ];

    for (const { pattern, reason } of sensitivePatterns) {
      if (pattern.test(text)) {
        return { isSensitive: true, reason };
      }
    }

    return { isSensitive: false };
  }
}

module.exports = { CommandParser };
