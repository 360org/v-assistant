import { useMemo, useRef, useState, useEffect, type DragEvent } from "react";
import { FileText, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { useApp, fileObjectURLs } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";
import { getKnowledgeFileRecord } from "@/runtime/knowledge";

export function Knowledge() {
  const {
    knowledgeFiles,
    addKnowledgeFiles,
    removeKnowledgeFile,
    activeAgentId,
    agents,
  } = useApp();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);

  // Knowledge belongs to the active role, so switching roles never mixes it.
  const roleName = useMemo(
    () => agents.find((a) => a.id === activeAgentId)?.name ?? null,
    [agents, activeAgentId],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addKnowledgeFiles(files);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Knowledge</h1>
        <Badge tone={roleName ? "gold" : undefined}>
          {roleName ? `Role: ${roleName}` : "Base assistant"}
        </Badge>
      </div>
      <p className="mt-1 text-neutral-400">
        {roleName
          ? `These documents belong to ${roleName} only — other roles don't see them.`
          : "Drop in your documents and the assistant learns them automatically. Switch to a role to give that role its own separate knowledge."}
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
          PDF · Word · Excel · PowerPoint · Image · Text · Markdown · CSV · HTML
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
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
                  <div
                    onClick={() => {
                      if (f.status === "ready") {
                        setPreviewFile({ id: f.id, name: f.name });
                      }
                    }}
                    className={cn(
                      "truncate text-sm",
                      f.status === "ready" ? "cursor-pointer hover:underline hover:text-gold-300" : ""
                    )}
                  >
                    {f.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {formatBytes(f.size)}
                    {f.status === "ready" && f.chunks
                      ? ` · ${f.chunks} section${f.chunks === 1 ? "" : "s"} learned`
                      : ""}
                    {f.status === "error" && f.error ? ` · ${f.error}` : ""}
                  </div>
                </div>
                {f.status === "processing" ? (
                  <Badge tone="gold">
                    <Loader2 className="size-3 animate-spin" /> Processing
                  </Badge>
                ) : f.status === "error" ? (
                  <Badge tone="red">Failed</Badge>
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

      {previewFile && (
        <FilePreviewModal
          fileId={previewFile.id}
          fileName={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

function FilePreviewModal({
  fileId,
  fileName,
  onClose,
}: {
  fileId: string;
  fileName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(fileObjectURLs.get(fileId) ?? null);

  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"].includes(ext);

  useEffect(() => {
    getKnowledgeFileRecord(fileId)
      .then((rec) => {
        if (rec) {
          if (rec.dataUrl) {
            setImageSrc(rec.dataUrl);
          }
          if (rec.chunks && rec.chunks.length > 0) {
            setContent(rec.chunks.join("\n\n"));
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load preview record:", e);
        setLoading(false);
      });
  }, [fileId]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 p-5 flex flex-col max-h-[90vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 border-b border-neutral-800 pb-3">
          <div className="min-w-0 flex-1 pr-4">
            <h3 className="font-semibold text-neutral-200 truncate text-base">{fileName}</h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">Xem trước tài liệu tri thức của Agent</p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-auto bg-neutral-950 rounded-xl border border-neutral-800/80 p-4 flex items-center justify-center min-h-[350px]">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              <Loader2 className="size-7 animate-spin text-gold-300" />
              <span className="text-xs">Đang tải nội dung xem trước...</span>
            </div>
          ) : isImage && imageSrc ? (
            <div className="flex items-center justify-center w-full h-full p-2">
              <img
                src={imageSrc}
                alt={fileName}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg select-none"
              />
            </div>
          ) : (
            <div className="w-full h-full text-left font-mono text-xs text-neutral-300 whitespace-pre-wrap select-text leading-relaxed p-2">
              {content || "Không có nội dung văn bản nào được trích xuất từ tệp này."}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2 shrink-0">
          <Button size="sm" onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
