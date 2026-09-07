/**
 * Centralized Structured Logger for Nova Browser
 * Provides transparent, unified logs across AI, Planner, Executor, Browser, Verifier, and UI.
 */

class Logger {
  constructor(tag = 'NOVA') {
    this.tag = tag;
  }

  static format(stage, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    let logStr = `[${timestamp}] [${stage.toUpperCase()}] ${message}`;
    if (data !== null && data !== undefined) {
      if (typeof data === 'object') {
        try {
          logStr += ` | ${JSON.stringify(data)}`;
        } catch (e) {
          logStr += ` | [Object]`;
        }
      } else {
        logStr += ` | ${data}`;
      }
    }
    return logStr;
  }

  static command(msg, data) {
    const line = Logger.format('COMMAND', msg, data);
    console.log(`\x1b[36m${line}\x1b[0m`);
    return line;
  }

  static ai(msg, data) {
    const line = Logger.format('AI', msg, data);
    console.log(`\x1b[35m${line}\x1b[0m`);
    return line;
  }

  static plan(msg, data) {
    const line = Logger.format('PLAN', msg, data);
    console.log(`\x1b[34m${line}\x1b[0m`);
    return line;
  }

  static executor(msg, data) {
    const line = Logger.format('EXECUTOR', msg, data);
    console.log(`\x1b[33m${line}\x1b[0m`);
    return line;
  }

  static browser(msg, data) {
    const line = Logger.format('BROWSER', msg, data);
    console.log(`\x1b[32m${line}\x1b[0m`);
    return line;
  }

  static verify(msg, data) {
    const line = Logger.format('VERIFY', msg, data);
    console.log(`\x1b[35m${line}\x1b[0m`);
    return line;
  }

  static task(msg, data) {
    const line = Logger.format('TASK', msg, data);
    console.log(`\x1b[1m\x1b[32m${line}\x1b[0m`);
    return line;
  }

  static error(msg, err) {
    const line = Logger.format('ERROR', msg, err ? (err.message || err) : '');
    console.error(`\x1b[31m${line}\x1b[0m`);
    return line;
  }
}

module.exports = { Logger };
