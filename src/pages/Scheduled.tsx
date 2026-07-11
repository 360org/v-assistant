import { useState } from "react";
import { CalendarClock, Pause, Play, Plus, Trash2, X } from "lucide-react";
import { useApp, type ScheduledTask } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 " +
  "text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60";

const SCHEDULE_PRESETS = [
  "Every day at 9:00",
  "Every weekday at 8:00",
  "Every Monday at 9:00",
  "Every hour",
  "On the 1st of each month",
];

export function Scheduled() {
  const {
    scheduledTasks,
    addScheduledTask,
    updateScheduledTask,
    removeScheduledTask,
  } = useApp();
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Scheduled tasks</h1>
          <p className="mt-1 text-neutral-400">
            Let your assistant run jobs on a schedule and message you the
            results — daily summaries, reminders, reports.
          </p>
        </div>
        <Button onClick={() => setEditorOpen(true)}>
          <Plus className="size-4" /> New task
        </Button>
      </div>

      {scheduledTasks.length === 0 ? (
        <Card className="mt-8 flex flex-col items-center gap-2 py-12 text-center">
          <CalendarClock className="size-8 text-gold-300" />
          <div className="font-semibold">No scheduled tasks yet</div>
          <p className="max-w-sm text-sm text-neutral-500">
            Create a task like "Every day at 8:00, summarize my unread email
            and send it to Telegram."
          </p>
        </Card>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {scheduledTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3"
            >
              <span
                className={
                  "flex size-9 shrink-0 items-center justify-center rounded-lg " +
                  (task.enabled
                    ? "bg-gold-400/15 text-gold-300"
                    : "bg-neutral-800 text-neutral-500")
                }
              >
                <CalendarClock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {task.name}
                  </span>
                  {task.enabled ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge>Paused</Badge>
                  )}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {task.schedule} · {task.prompt}
                </div>
              </div>
              <button
                onClick={() =>
                  updateScheduledTask(task.id, { enabled: !task.enabled })
                }
                className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                title={task.enabled ? "Pause" : "Resume"}
              >
                {task.enabled ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </button>
              <button
                onClick={() => removeScheduledTask(task.id)}
                className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                title="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editorOpen && (
        <TaskEditor
          onClose={() => setEditorOpen(false)}
          onSave={(task) => {
            addScheduledTask(task);
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TaskEditor({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (task: Omit<ScheduledTask, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState(SCHEDULE_PRESETS[0]);

  const valid = name.trim() !== "" && prompt.trim() !== "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">New scheduled task</h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="text-xs text-neutral-400">
            Name
            <input
              className={`${inputClass} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Morning email summary"
            />
          </label>
          <label className="text-xs text-neutral-400">
            What should the assistant do?
            <textarea
              className={`${inputClass} mt-1 min-h-20 resize-y`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Summarize my unread email and send it to Telegram."
            />
          </label>
          <label className="text-xs text-neutral-400">
            Schedule
            <input
              className={`${inputClass} mt-1`}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              list="schedule-presets"
              placeholder="Every day at 9:00"
            />
            <datalist id="schedule-presets">
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() =>
              onSave({
                name: name.trim(),
                prompt: prompt.trim(),
                schedule: schedule.trim() || "Every day at 9:00",
                enabled: true,
              })
            }
          >
            Create task
          </Button>
        </div>
      </div>
    </div>
  );
}
