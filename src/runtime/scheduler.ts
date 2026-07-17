/**
 * Scheduled-task runner.
 *
 * The store ticks this once a minute. For every enabled task that is due, it
 * runs the same embedded assistant the chat UI uses and hands the result to a
 * `deliver` callback (shown in chat, and pushed to Telegram when connected).
 * `markRun` records the run time first, so a task never double-fires.
 *
 * The tick itself is a pure function of its inputs, so it is tested directly
 * (scripts/schedule-check.mjs) without React.
 */

import { runAssistant, newMessageId, type ChatOptions } from "./engine";
import { isDue } from "./schedule";

export interface SchedulableTask {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  lastRun?: number;
}

export interface SchedulerDeps {
  /** Current chat options (provider/agent), or null if not signed in. */
  resolveOptions: () => ChatOptions | null;
  /** Persist that a task ran at `at` (ms) — called before the run starts. */
  markRun: (taskId: string, at: number) => void;
  /** Deliver a completed run's result. */
  deliver: (task: SchedulableTask, result: string) => void | Promise<void>;
}

/** Run every task that is due at `now`. Returns the ids that fired. */
export async function runDueTasks(
  tasks: SchedulableTask[],
  now: Date,
  deps: SchedulerDeps,
): Promise<string[]> {
  const fired: string[] = [];
  for (const task of tasks) {
    if (!task.enabled) continue;
    if (!isDue(task.schedule, now, task.lastRun)) continue;

    // Record the run up front so the next minute's tick won't re-fire it,
    // even while this run is still in flight.
    deps.markRun(task.id, now.getTime());
    fired.push(task.id);

    const options = deps.resolveOptions();
    if (!options) continue;
    try {
      const result = await runAssistant(
        [
          {
            id: newMessageId(),
            role: "user",
            content: task.prompt,
            createdAt: now.getTime(),
          },
        ],
        options,
      );
      await deps.deliver(task, result);
    } catch (e) {
      await deps.deliver(
        task,
        `⚠️ ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return fired;
}
