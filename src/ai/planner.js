/**
 * Task Planner for Nova Browser
 * Coordinates user intent, contextual memory, and AIProvider plan generation.
 */

const { AIProvider } = require('./aiProvider');

class TaskPlanner {
  /**
   * @param {AIProvider} aiProvider 
   */
  constructor(aiProvider) {
    this.aiProvider = aiProvider || new AIProvider();
  }

  /**
   * Generate an execution plan from user command
   * @param {Object} params
   * @param {string} params.command
   * @param {Object} params.pageContext
   * @param {Object} params.taskMemory
   * @returns {Promise<Object>}
   */
  async planTask({ command, pageContext = {}, taskMemory = {} }) {
    if (!command || !command.trim()) {
      throw new Error('Empty command provided to planner');
    }

    const plan = await this.aiProvider.createPlan({
      command: command.trim(),
      pageContext,
      taskMemory
    });

    // Validate plan structure
    if (!plan || !Array.isArray(plan.steps)) {
      throw new Error('Planner failed to generate valid action steps');
    }

    return {
      command: command.trim(),
      thought: plan.thought || 'Formulated action plan',
      goal: plan.goal || command.trim(),
      steps: plan.steps,
      requiresConfirmation: plan.requiresConfirmation || false,
      confirmationMessage: plan.confirmationMessage || '',
      verificationCriteria: plan.verificationCriteria || {}
    };
  }
}

module.exports = { TaskPlanner };
