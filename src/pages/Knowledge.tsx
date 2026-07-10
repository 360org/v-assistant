import { useRef, useState, type DragEvent } from "react";
import { FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useApp } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { cn, formatBytes } from "@/lib/utils";

export function Knowledge() {
  const { knowledgeFiles, addKnowledgeFiles, removeKnowledgeFile } = useApp();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).map((f) => ({
      name: f.name,
      size: f.size,
    }));
    if (files.length) addKnowledgeFiles(files);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-bold">Knowledge</h1>
      <p className="mt-1 text-neutral-400">
        Drop in your documents and the assistant learns them automatically. No
        indexing, no setup — it just works.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mt-8 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          dragging
            ? "border-gold-400 bg-gold-400/5"
            : "border-neutral-800 hover:border-neutral-600",
        )}
      >
        <UploadCloud className="size-8 text-gold-300" />
        <p className="mt-3 font-medium">Drag & drop files here</p>
        <p className="mt-1 text-sm text-neutral-500">
          PDF · Word · Excel · PowerPoint · Folders · Websites
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).map((f) => ({
              name: f.name,
              size: f.size,
            }));
            if (files.length) addKnowledgeFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      {knowledgeFiles.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-300">
            Your knowledge ({knowledgeFiles.length})
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {knowledgeFiles.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3"
              >
                <FileText className="size-4 shrink-0 text-neutral-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.name}</div>
                  <div className="text-xs text-neutral-500">
                    {formatBytes(f.size)}
                  </div>
                </div>
                {f.status === "processing" ? (
                  <Badge tone="gold">
                    <Loader2 className="size-3 animate-spin" /> Processing
                  </Badge>
                ) : (
                  <Badge tone="green">Ready</Badge>
                )}
                <button
                  onClick={() => removeKnowledgeFile(f.id)}
                  className="cursor-pointer rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-800 hover:text-red-400"
                  title="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
