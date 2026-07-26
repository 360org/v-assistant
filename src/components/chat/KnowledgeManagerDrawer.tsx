import { Globe, Image, Link2, FileText, FileCode, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/components/MessageContent";

interface SharedMediaItems {
  media: { id: string; name: string; dataUrl?: string }[];
  links: { url: string; date: string }[];
  docs: { id: string; name: string }[];
}

interface KnowledgeManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tab: "media" | "link" | "docs";
  setTab: (t: "media" | "link" | "docs") => void;
  sharedMediaItems: SharedMediaItems;
  onPreviewFile: (file: { id: string; name: string }) => void;
}

export function KnowledgeManagerDrawer({
  isOpen,
  onClose,
  tab,
  setTab,
  sharedMediaItems,
  onPreviewFile,
}: KnowledgeManagerDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-neutral-800 bg-neutral-900/95 flex flex-col shrink-0 animate-fadeIn transition-all h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0">
        <div>
          <h3 className="font-semibold text-neutral-200 text-sm">Files & Media</h3>
          <p className="text-[10px] text-neutral-400 mt-0.5">Media, liên kết và tài liệu đã chia sẻ</p>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
          title="Đóng"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-neutral-800 p-1.5 gap-1 bg-neutral-950/40 shrink-0">
        <button
          onClick={() => setTab("media")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
            tab === "media"
              ? "bg-gold-400/20 text-gold-300 border border-gold-400/30"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
          )}
        >
          Media ({sharedMediaItems.media.length})
        </button>
        <button
          onClick={() => setTab("link")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
            tab === "link"
              ? "bg-gold-400/20 text-gold-300 border border-gold-400/30"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
          )}
        >
          Link ({sharedMediaItems.links.length})
        </button>
        <button
          onClick={() => setTab("docs")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
            tab === "docs"
              ? "bg-gold-400/20 text-gold-300 border border-gold-400/30"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
          )}
        >
          Docs ({sharedMediaItems.docs.length})
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "media" && (
          sharedMediaItems.media.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs">
              <Image className="size-8 mb-2 opacity-40" />
              Chưa có hình ảnh nào được chia sẻ
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {sharedMediaItems.media.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onPreviewFile({ id: item.id, name: item.name })}
                  className="group relative aspect-square rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden cursor-pointer hover:border-gold-400 transition-all shadow-xs"
                  title={item.name}
                >
                  {item.dataUrl ? (
                    <img src={item.dataUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 select-none" />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full bg-neutral-850 text-neutral-400">
                      <FileText className="size-5" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
                    <span className="text-[9px] text-neutral-200 truncate w-full">{item.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "link" && (
          sharedMediaItems.links.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs">
              <Globe className="size-8 mb-2 opacity-40" />
              Chưa có liên kết URL nào
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sharedMediaItems.links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    void openExternalUrl(link.url);
                  }}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-850 hover:border-gold-400/50 transition-all text-xs group cursor-pointer"
                >
                  <Link2 className="size-4 text-gold-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-neutral-200 truncate group-hover:text-gold-300">{link.url}</p>
                    <span className="text-[10px] text-neutral-500 mt-0.5 block">{link.date}</span>
                  </div>
                  <ExternalLink className="size-3 text-neutral-500 shrink-0 mt-0.5 group-hover:text-gold-400" />
                </a>
              ))}
            </div>
          )
        )}

        {tab === "docs" && (
          sharedMediaItems.docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs">
              <FileCode className="size-8 mb-2 opacity-40" />
              Chưa có tài liệu nào
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sharedMediaItems.docs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onPreviewFile({ id: doc.id, name: doc.name })}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-850 hover:border-gold-400/50 transition-all text-xs cursor-pointer group"
                >
                  <FileText className="size-4 text-gold-400 shrink-0" />
                  <span className="truncate text-neutral-200 group-hover:text-gold-300">{doc.name}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
