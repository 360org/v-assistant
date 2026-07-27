// Checks the Host Process scheduler: schedule matching, due selection against
// the shared scheduled_tasks.json, run bookkeeping, and that a fired task's
// answer reaches outbound.db. Deterministic, no network.
// Run: npx tsx scripts/scheduler-check.mjs

import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const dir = mkdtempSync(path.join(tmpdir(), 'ar-sched-'));
process.env.VUA_DATA_DIR = dir;
process.env.VUA_IPC_DIR = path.join(dir, 'ipc');

const { createInboundSchema, closeAll, getOutboundDb } = await import('../src/db/connection.ts');
createInboundSchema();

const { isDue } = await import('../src/scheduler/schedule.ts');
const { readTasks, dueTasks, getLastRun, setLastRun, runDueTasks } = await import('../src/scheduler/index.ts');

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) pass = false;
};

// --- schedule matching -------------------------------------------------------
const at9 = new Date('2026-03-10T09:05:00');
check('daily fires once the time has passed', isDue('Every day at 09:00', at9, undefined));
check('daily does not re-fire after running today', !isDue('Every day at 09:00', at9, at9.getTime() - 60_000));
check('daily waits until its time', !isDue('Every day at 23:00', at9, undefined));
check('hourly respects the hour gap', !isDue('Every hour', at9, at9.getTime() - 60_000));
check('hourly fires after an hour', isDue('Every hour', at9, at9.getTime() - 3_600_000));
// 2026-03-10 is a Tuesday.
check('named weekday only fires on that day', !isDue('Every Monday at 09:00', at9, undefined));
check('weekdays skip the weekend', !isDue('Weekdays at 08:00', new Date('2026-03-08T09:00:00'), undefined));

// --- reads the same file the schedule_task tool writes ------------------------
const tasks = [
  { id: 't1', name: 'Daily report', prompt: 'Summarise today', schedule: 'Every day at 09:00', enabled: true },
  { id: 't2', name: 'Disabled', prompt: 'Nope', schedule: 'Every day at 09:00', enabled: false },
  { id: 't3', name: 'Later', prompt: 'Not yet', schedule: 'Every day at 23:00', enabled: true },
];
writeFileSync(path.join(dir, 'scheduled_tasks.json'), JSON.stringify(tasks, null, 2));

check('reads the shared scheduled_tasks.json', readTasks().length === 3);

const due = dueTasks(readTasks(), at9);
check('only the due, enabled task is selected', due.length === 1 && due[0].id === 't1');

// --- run bookkeeping ---------------------------------------------------------
check('a task with no history has no last run', getLastRun('t1') === undefined);
setLastRun('t1', at9.getTime());
check('last run is remembered across reads', getLastRun('t1') === at9.getTime());
check('a task does not fire twice in the same window', dueTasks(readTasks(), at9).length === 0);

// A task created moments ago must not fire immediately on the next tick.
writeFileSync(
  path.join(dir, 'scheduled_tasks.json'),
  JSON.stringify([{ id: 'fresh', name: 'Fresh', prompt: 'x', schedule: 'Every day at 09:00', enabled: true, lastRun: at9.getTime() }]),
);
check('a freshly created task respects its creation stamp', dueTasks(readTasks(), at9).length === 0);

// --- a fired task delivers its answer ---------------------------------------
writeFileSync(
  path.join(dir, 'scheduled_tasks.json'),
  JSON.stringify([{ id: 'run1', name: 'Runner', prompt: 'say hi', schedule: 'Every day at 09:00', enabled: true }]),
);

const stubProvider = {
  name: 'stub',
  query: () => ({
    events: (async function* () {
      yield { type: 'text_delta', text: 'scheduled answer' };
      yield { type: 'result', text: 'scheduled answer' };
    })(),
  }),
  isSessionInvalid: () => false,
};

const fired = await runDueTasks(
  { provider: stubProvider, providerName: 'stub', agentId: 'default', systemContext: { instructions: '' } },
  at9,
);
check('the due task fired', fired.length === 1 && fired[0] === 'run1');

const rows = getOutboundDb().prepare('SELECT channel_type, content FROM messages_out').all();
const delivered = rows.map((r) => String(r.content)).join('\n');
check('the answer reached outbound.db', delivered.includes('scheduled answer'));
check('the delivery names its task', delivered.includes('run1'));
// Chat, Telegram and schedules share one outbound queue; without this tag the
// chat window would show a scheduled result as the answer to its own question.
check('the delivery is tagged as scheduled', rows.every((r) => r.channel_type === 'scheduled'));

closeAll();
console.log(pass ? '\n✓ Host Process scheduler works' : '\n✗ FAILED');
process.exit(pass ? 0 : 1);
