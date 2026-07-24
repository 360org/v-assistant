import { useEffect, useRef, useState } from "react";
import {
  Download,
  Image as ImageIcon,
  Maximize2,
  MessageSquare,
  Plus,
  Sparkles,
  Video,
  Wand2,
  X,
} from "lucide-react";
import {
  getAllImageRecords,
  getKnowledgeFileRecord,
  indexKnowledgeFile,
  savePhysicalDataFile,
  syncAllKnowledgeFilesToDisk,
} from "@/runtime/knowledge";
import { fileObjectURLs, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Media Gallery displays ONLY media uploaded by user through chat or knowledge

function GalleryCardImage({
  item,
}: {
  item: { id: string; title: string; url: string };
}) {
  const { customDataPath } = useApp();
  const [src, setSrc] = useState<string>(item.url || fileObjectURLs.get(item.id) || "");
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSrc() {
      // If src is valid dataUrl Base64 or http URL and not expired blob
      if (src && !src.startsWith("blob:")) return;

      const rec = await getKnowledgeFileRecord(item.id).catch(() => null);
      if (cancelled) return;

      if (rec?.dataUrl && !rec.dataUrl.startsWith("blob:")) {
        setSrc(rec.dataUrl);
        return;
      } else if (rec?.chunks?.[0]?.startsWith("data:image/")) {
        setSrc(rec.chunks[0]);
        return;
      }

      const hostDir = customDataPath || localStorage.getItem("vua:custom-data-path");
      if (hostDir && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          setSrc(convertFileSrc(`${hostDir}/uploads/${item.title}`));
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
  }, [item.id, item.title, src, customDataPath]);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={item.title}
        onError={() => {
          const hostDir = customDataPath || localStorage.getItem("vua:custom-data-path");
          if (hostDir && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && !src.includes("asset")) {
            import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
              setSrc(convertFileSrc(`${hostDir}/uploads/${item.title}`));
            }).catch(() => setImgError(true));
          } else {
            setImgError(true);
          }
        }}
        className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-48 w-full flex-col items-center justify-center bg-neutral-900/90 text-gold-300 p-4 rounded-xl border border-neutral-800/80">
      <ImageIcon className="size-8 text-gold-400 mb-2" />
      <span className="text-xs text-center truncate max-w-full font-medium">{item.title}</span>
    </div>
  );
}

export function MediaGallery() {
  const { setView, messages, chatSessions, activeSessionId, switchChatSession, customDataPath } = useApp();
  const [idbImages, setIdbImages] = useState<Array<{ id: string; name: string; dataUrl?: string }>>([]);
  const [selectedImage, setSelectedImage] = useState<{
    id: string;
    name: string;
    url: string;
    sessionId?: string;
    sessionTitle?: string;
  } | null>(null);
  const [promptText, setPromptText] = useState("");
  const [filterType, setFilterType] = useState<"all" | "chat" | "uploaded">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = async () => {
    try {
      const records = await getAllImageRecords();
      setIdbImages(records);
      void syncAllKnowledgeFilesToDisk();
    } catch (e) {
      console.error("Failed to load media records:", e);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, []);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const fileId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      await indexKnowledgeFile(null, fileId, file);
    }
    await loadMedia();
  };

  // Collect chat images from active messages & all chat sessions
  const chatMediaItems: Array<{
    id: string;
    title: string;
    url: string;
    sessionId: string;
    sessionTitle: string;
  }> = [];

  const seenIds = new Set<string>();
  const imgExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"];

  // Helper to extract attachments
  const extractFromMessages = (msgs: typeof messages, sId: string, sTitle: string) => {
    msgs.forEach((m) => {
      if (m.attachments) {
        m.attachments.forEach((att) => {
          const ext = att.name.toLowerCase().split(".").pop() ?? "";
          if (imgExtensions.includes(ext) && !seenIds.has(att.id)) {
            seenIds.add(att.id);
            const url = att.dataUrl || fileObjectURLs.get(att.id) || "";
            chatMediaItems.push({
              id: att.id,
              title: att.name,
              url,
              sessionId: sId,
              sessionTitle: sTitle,
            });
          }
        });
      }
    });
  };

  extractFromMessages(messages, activeSessionId || "default", "Phiên chat hiện tại");
  chatSessions.forEach((session) => {
    extractFromMessages(session.messages, session.id, session.title || "Cuộc trò chuyện");
  });

  // Combine chat images & user uploaded IDB images ONLY
  const allGalleryItems = [
    ...chatMediaItems.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      sessionId: item.sessionId,
      sessionTitle: item.sessionTitle,
      type: "chat" as const,
    })),
    ...idbImages
      .filter((img) => !seenIds.has(img.id))
      .map((img) => ({
        id: img.id,
        title: img.name,
        url: img.dataUrl || fileObjectURLs.get(img.id) || "",
        type: "uploaded" as const,
      })),
  ];

  const filteredItems = allGalleryItems.filter((item) => {
    if (filterType === "chat") return item.type === "chat";
    if (filterType === "uploaded") return item.type === "uploaded";
    return true;
  });

  const goToChatSession = (sessionId?: string) => {
    if (sessionId && sessionId !== "default") {
      switchChatSession(sessionId);
    }
    setView("chat");
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files)}
      />

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 pb-32">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-100 flex items-center gap-2">
              <ImageIcon className="size-5 text-gold-400" />
              Media Vault
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              Kho lưu trữ hình ảnh & phương tiện được tải lên từ các cuộc trò chuyện Chat
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 text-xs bg-neutral-900/80 p-1 rounded-xl border border-neutral-800">
              <button
                onClick={() => setFilterType("all")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-colors cursor-pointer font-medium",
                  filterType === "all" ? "bg-gold-400/20 text-gold-300 border border-gold-400/40" : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Tất cả ({allGalleryItems.length})
              </button>
              <button
                onClick={() => setFilterType("chat")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-colors cursor-pointer font-medium",
                  filterType === "chat" ? "bg-gold-400/20 text-gold-300 border border-gold-400/40" : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Từ Chat ({chatMediaItems.length})
              </button>
              <button
                onClick={() => setFilterType("uploaded")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-colors cursor-pointer font-medium",
                  filterType === "uploaded" ? "bg-gold-400/20 text-gold-300 border border-gold-400/40" : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Knowledge Files ({idbImages.length})
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-200"
            >
              <Plus className="size-4" /> Tải ảnh lên
            </Button>
          </div>
        </div>

        {/* Gallery Grid or Empty State */}
        {filteredItems.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-900/40 p-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-neutral-900 border border-neutral-800 text-gold-400 shadow-inner">
              <ImageIcon className="size-8" />
            </div>
            <h3 className="mt-4 text-base font-bold text-neutral-100">Chưa có tệp Media nào</h3>
            <p className="mt-1.5 max-w-sm text-xs text-neutral-400 leading-relaxed">
              Tất cả ảnh và tệp truyền thông bạn hoặc AI Agent gửi trong cuộc trò chuyện Chat sẽ tự động được lưu trữ và hiển thị tại đây.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button size="sm" onClick={() => setView("chat")} className="bg-gold-400 text-neutral-950 hover:bg-gold-300 font-semibold cursor-pointer shadow-md">
                <MessageSquare className="size-4" /> Đến trang Chat ngay
              </Button>
              <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
                <Plus className="size-4" /> Tải ảnh trực tiếp lên
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5">
            {filteredItems.map((item, idx) => (
              <div
                key={item.id + idx}
                onClick={() =>
                  setSelectedImage({
                    id: item.id,
                    name: item.title,
                    url: item.url,
                    sessionId: "sessionId" in item ? item.sessionId : undefined,
                    sessionTitle: "sessionTitle" in item ? item.sessionTitle : undefined,
                  })
                }
                className="group relative mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900 cursor-pointer shadow-md transition-all duration-300 hover:border-gold-400/80 hover:shadow-gold-500/10"
              >
                <GalleryCardImage item={item} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-3 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    {"sessionTitle" in item ? (
                      <span className="rounded-full bg-gold-400/20 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-gold-300 border border-gold-400/30 truncate max-w-[130px]">
                        💬 {item.sessionTitle}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="rounded-full bg-black/50 backdrop-blur-xs p-1.5 text-white hover:bg-black">
                      <Maximize2 className="size-3.5" />
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-white truncate drop-shadow-xs">
                      {item.title}
                    </span>
                    {"sessionId" in item && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          goToChatSession(item.sessionId);
                        }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-gold-300 hover:underline"
                      >
                        <MessageSquare className="size-3" /> Go to Chat →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Prompt & Filter Bar at Bottom */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-20">
        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/95 p-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer"
              title="Add Image"
            >
              <Plus className="size-4" />
            </button>
            <input
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Type to imagine or search media..."
              className="flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
            <button
              onClick={() => setView("chat")}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-400 text-neutral-950 hover:bg-gold-300 transition-colors cursor-pointer shadow-md"
              title="Create in Chat"
            >
              <Wand2 className="size-4" />
            </button>
          </div>

          {/* Interactive Badges */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 font-medium text-neutral-200 cursor-pointer hover:border-gold-400">
              <ImageIcon className="size-3 text-gold-400" /> Image
            </span>
            <span className="flex items-center gap-1 rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2.5 py-1 text-neutral-400 cursor-pointer hover:text-neutral-200">
              <Video className="size-3" /> Video
            </span>
            <span className="flex items-center gap-1 rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2.5 py-1 text-neutral-400 cursor-pointer hover:text-neutral-200">
              <Sparkles className="size-3" /> Agent
            </span>
            <span className="rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1 text-neutral-400">
              Speed: <span className="text-neutral-200 font-medium">Auto</span>
            </span>
            <span className="rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1 text-neutral-400">
              Ratio: <span className="text-neutral-200 font-medium">2:3</span>
            </span>
          </div>
        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs animate-fadeIn"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl rounded-3xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl flex flex-col md:flex-row gap-6 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 flex items-center justify-center bg-black rounded-2xl overflow-hidden min-h-[300px] max-h-[70vh]">
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                onError={(e) => {
                  const target = e.currentTarget;
                  const hostDir = customDataPath || localStorage.getItem("vua:custom-data-path");
                  if (hostDir && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && !target.src.includes("asset")) {
                    import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
                      target.src = convertFileSrc(`${hostDir}/uploads/${selectedImage.name}`);
                    }).catch(() => {});
                  }
                }}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>

            <div className="w-full md:w-80 flex flex-col justify-between p-2">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-neutral-100 text-base truncate">
                    {selectedImage.name}
                  </h3>
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white cursor-pointer"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                {selectedImage.sessionTitle && (
                  <p className="mt-2 text-xs font-semibold text-gold-300 bg-gold-400/10 px-2.5 py-1 rounded-lg border border-gold-400/30 truncate">
                    💬 Từ: {selectedImage.sessionTitle}
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {selectedImage.sessionId && (
                  <button
                    onClick={() => {
                      const sId = selectedImage.sessionId;
                      setSelectedImage(null);
                      goToChatSession(sId);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-gold-300 transition-colors shadow-md cursor-pointer"
                  >
                    <MessageSquare className="size-4" /> Go Direct to Chat Conversation
                  </button>
                )}
                <a
                  href={selectedImage.url}
                  download={selectedImage.name}
                  className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-750 transition-colors"
                >
                  <Download className="size-4" /> Download Image
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
