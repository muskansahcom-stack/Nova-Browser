/**
 * BrowserAgent - Main Agent Class for Nova Browser
 */

const { AIProvider } = require('../ai/aiProvider');
const { TaskPlanner } = require('../ai/planner');
const { ActionExecutor } = require('./actionExecutor');
const { TaskManager } = require('./taskManager');
const { ComputerController } = require('../computer/computerController');

class BrowserAgent {
  constructor(options = {}) {
    this.aiProvider = new AIProvider(options.aiConfig || {});
    this.planner = new TaskPlanner(this.aiProvider);
    this.computerController = new ComputerController();
    this.executor = new ActionExecutor({
      computerController: this.computerController,
      ...options.executorContext
    });

    this.taskManager = new TaskManager({
      planner: this.planner,
      executor: this.executor,
      onRequestPermission: options.onRequestPermission,
      onTaskEvent: options.onTaskEvent
    });
  }

  /**
   * Set dynamic browser tab execution context
   */
  setExecutionContext(context) {
    this.taskManager.setContext(context);
  }

  /**
   * Run user natural language request
   * @param {string} command 
   */
  async executeCommand(command) {
    return await this.taskManager.runTask(command);
  }

  /**
   * Abort running task
   */
  abort() {
    this.taskManager.abortCurrentTask();
  }

  /**
   * Update AI settings / keys
   */
  updateConfig(config) {
    this.aiProvider.updateConfig(config);
  }
}

module.exports = { BrowserAgent };
