import { useState, useEffect } from "react";
import { Image, Paperclip } from "lucide-react";
import { useApp, fileObjectURLs } from "@/lib/store";
import { getKnowledgeFileRecord } from "@/runtime/knowledge";

export function InlineAttachmentPreview({
  att,
  onOpenPreview,
}: {
  att: { id: string; name: string; dataUrl?: string };
  onOpenPreview: () => void;
}) {
  const { customDataPath } = useApp();
  const ext = att.name.toLowerCase().split(".").pop() ?? "";
  const isImg = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"].includes(ext);
  const [imgSrc, setImgSrc] = useState<string | null>(att.dataUrl || fileObjectURLs.get(att.id) || null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!isImg) return;
    let cancelled = false;

    async function loadSrc() {
      const rec = await getKnowledgeFileRecord(att.id).catch(() => null);
      if (cancelled) return;

      if (rec?.dataUrl && !rec.dataUrl.startsWith("blob:")) {
        setImgSrc(rec.dataUrl);
        return;
      } else if (rec?.chunks?.[0]?.startsWith("data:image/")) {
        setImgSrc(rec.chunks[0]);
        return;
      }

      const hostDir = customDataPath || localStorage.getItem("vua:custom-data-path");
      if (hostDir && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          setImgSrc(convertFileSrc(`${hostDir}/uploads/${att.name}`));
          return;
        } catch {
          /* fallback */
        }
      }
    }

    void loadSrc();

    return () => {
      cancelled = true;
    };
  }, [att.id, att.name, isImg, customDataPath]);

  if (isImg) {
    return (
      <div
        onClick={onOpenPreview}
        className="group relative overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-950 cursor-pointer transition-all hover:border-gold-400 max-w-[280px] max-h-[220px] shadow-md"
        title={`Xem ảnh phóng to: ${att.name}`}
      >
        {imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt={att.name}
            onError={() => {
              const hostDir = customDataPath || localStorage.getItem("vua:custom-data-path");
              if (hostDir && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && !imgSrc.includes("asset")) {
                import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
                  setImgSrc(convertFileSrc(`${hostDir}/uploads/${att.name}`));
                }).catch(() => setImgError(true));
              } else {
                setImgError(true);
              }
            }}
            className="max-h-[220px] w-full object-cover rounded-xl transition-transform duration-200 group-hover:scale-105 select-none"
          />
        ) : (
          <div className="flex items-center gap-2 p-3 text-xs text-gold-300 bg-neutral-900/90 rounded-xl">
            <Image className="size-4 shrink-0 text-gold-400" />
            <span className="truncate max-w-[180px] font-medium">{att.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
          <span className="text-[10px] text-white truncate font-medium">{att.name}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onOpenPreview}
      className="flex items-center gap-2 rounded-xl border border-gold-500/40 bg-gold-400/10 px-3 py-1.5 text-xs font-medium text-gold-300 hover:bg-gold-400/20 hover:border-gold-400 transition-all cursor-pointer shadow-xs"
      title={`Bấm để xem trước: ${att.name}`}
    >
      <Paperclip className="size-3.5 text-gold-400 shrink-0" />
      <span className="max-w-[180px] truncate">{att.name}</span>
    </button>
  );
}
