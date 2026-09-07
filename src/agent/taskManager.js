/**
 * Task Manager for Nova Browser
 * Implements the full autonomous agent execution cycle with live logging and memory
 */

const { TaskPlanner } = require('../ai/planner');
const { ActionExecutor } = require('./actionExecutor');
const { ActionRegistry } = require('./actionRegistry');
const { TaskVerifier } = require('./verifier');
const { OBSERVER_SCRIPT } = require('../browser/pageObserver');
const { Logger } = require('./logger');

class TaskManager {
  /**
   * @param {Object} options
   * @param {TaskPlanner} options.planner
   * @param {ActionExecutor} options.executor
   * @param {Function} options.onRequestPermission
   * @param {Function} options.onTaskEvent - Emits live status updates to UI
   */
  constructor({ planner, executor, onRequestPermission, onTaskEvent }) {
    this.planner = planner;
    this.executor = executor;
    this.onRequestPermission = onRequestPermission || (async () => true);
    this.onTaskEvent = onTaskEvent || (() => {});

    // Working memory across commands
    this.memory = {
      lastSearchQuery: null,
      lastSearchResults: [],
      lastNavigatedUrl: null,
      history: []
    };

    this.currentTask = null;
    this.isAborted = false;
  }

  /**
   * Update action executor context
   */
  setContext(context) {
    this.executor.setContext(context);
  }

  /**
   * Cancel ongoing task
   */
  abortCurrentTask() {
    this.isAborted = true;
    this.emitEvent('task_aborted', { message: 'Task cancelled by user.' });
  }

  emitEvent(type, payload = {}) {
    this.onTaskEvent({
      type,
      timestamp: Date.now(),
      taskId: this.currentTask ? this.currentTask.id : null,
      ...payload
    });
  }

  /**
   * Runs an end-to-end task from natural language
   * @param {string} userCommand 
   */
  async runTask(userCommand) {
    this.isAborted = false;
    const taskId = 'task_' + Date.now();
    this.currentTask = {
      id: taskId,
      command: userCommand,
      actionsTaken: [],
      startTime: Date.now()
    };

    Logger.command(`User command received: "${userCommand}"`);

    this.emitEvent('task_started', {
      command: userCommand,
      status: 'Understanding request...'
    });

    try {
      // 1. OBSERVE INITIAL STATE
      const initialPageContext = await this._observeCurrentPage();

      // 2. PLAN
      this.emitEvent('planning', { status: 'Planning steps...' });
      const plan = await this.planner.planTask({
        command: userCommand,
        pageContext: initialPageContext,
        taskMemory: this.memory
      });

      Logger.plan(`Plan established: ${plan.goal}`, plan.steps);

      this.currentTask.plan = plan;
      this.emitEvent('plan_created', {
        thought: plan.thought,
        goal: plan.goal,
        stepCount: plan.steps.length,
        steps: plan.steps
      });

      // 3. CHECK PERMISSION FOR HIGH-IMPACT ACTIONS
      if (plan.requiresConfirmation || plan.steps.some(ActionRegistry.requiresConfirmation)) {
        Logger.task(`Permission required for sensitive action: ${plan.confirmationMessage}`);
        this.emitEvent('permission_requested', {
          message: plan.confirmationMessage || `Nova requires approval to perform actions for: "${userCommand}"`
        });

        const allowed = await this.onRequestPermission({
          command: userCommand,
          reason: plan.confirmationMessage || 'Potentially high-impact browser action'
        });

        if (!allowed) {
          Logger.task('Permission denied by user');
          this.emitEvent('permission_denied', { message: 'Action cancelled by user permission.' });
          return { success: false, reason: 'Action denied by user' };
        }
      }

      // 4. EXECUTE STEPS
      for (let i = 0; i < plan.steps.length; i++) {
        if (this.isAborted) {
          Logger.task('Task stopped by user');
          this.emitEvent('task_aborted', { message: 'Task stopped.' });
          return { success: false, reason: 'Task aborted' };
        }

        const step = plan.steps[i];
        const stepNum = i + 1;
        const totalSteps = plan.steps.length;

        Logger.executor(`[Step ${stepNum}/${totalSteps}] Starting action: ${step.action}`, step);

        this.emitEvent('step_started', {
          stepIndex: i,
          stepNumber: stepNum,
          totalSteps,
          step,
          status: `Executing step ${stepNum}/${totalSteps}: ${step.action}`
        });

        // Execute action with live progress callback
        const result = await this.executor.execute(step, (status) => {
          this.emitEvent('step_progress', { stepIndex: i, status });
        });

        this.currentTask.actionsTaken.push({ step, result });

        if (!result.success && !step.optional) {
          Logger.error(`[Step ${stepNum}/${totalSteps}] Failed:`, result.error);
          this.emitEvent('step_failed', {
            stepIndex: i,
            error: result.error,
            status: `Step ${stepNum} encountered issue: ${result.error}`
          });
        } else {
          Logger.executor(`[Step ${stepNum}/${totalSteps}] Success:`, result);
          this.emitEvent('step_completed', {
            stepIndex: i,
            result,
            status: `Completed step ${stepNum}/${totalSteps}`
          });
        }

        // Brief delay between steps for visual feedback and DOM stabilization
        await new Promise(r => setTimeout(r, 600));
      }

      // 5. OBSERVE FINAL STATE & VERIFY
      this.emitEvent('verifying', { status: 'Verifying task completion...' });
      const finalPageContext = await this._observeCurrentPage();

      // Update memory
      if (finalPageContext.searchResults && finalPageContext.searchResults.length > 0) {
        this.memory.lastSearchResults = finalPageContext.searchResults;
      }
      this.memory.lastNavigatedUrl = finalPageContext.url;
      this.memory.history.push({
        command: userCommand,
        goal: plan.goal,
        url: finalPageContext.url,
        timestamp: Date.now()
      });

      const verification = TaskVerifier.verify({
        command: userCommand,
        goal: plan.goal,
        actionsTaken: this.currentTask.actionsTaken,
        finalState: finalPageContext,
        verificationCriteria: plan.verificationCriteria
      });

      if (verification.success) {
        Logger.task(`Task Completed Successfully: ${verification.reason}`);
        this.emitEvent('task_completed', {
          success: true,
          goal: plan.goal,
          reason: verification.reason,
          status: 'Task completed.'
        });
        return { success: true, goal: plan.goal, reason: verification.reason };
      } else {
        Logger.task(`Task Completed with Note: ${verification.reason}`);
        this.emitEvent('task_completed_warning', {
          success: false,
          goal: plan.goal,
          reason: verification.reason,
          status: `Completed with warning: ${verification.reason}`
        });
        return { success: false, goal: plan.goal, reason: verification.reason };
      }

    } catch (err) {
      Logger.error('Task Execution Exception:', err);
      this.emitEvent('task_failed', {
        error: err.message,
        status: `Task failed: ${err.message}`
      });
      return { success: false, error: err.message };
    }
  }

  async _observeCurrentPage() {
    try {
      if (this.executor.context && this.executor.context.executeScript) {
        const obs = await this.executor.context.executeScript(OBSERVER_SCRIPT);
        if (obs && !obs.error) return obs;
      }
    } catch (e) {}

    return {
      url: 'about:blank',
      title: '',
      elements: [],
      searchResults: []
    };
  }
}

module.exports = { TaskManager };
