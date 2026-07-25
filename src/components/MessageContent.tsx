import { Fragment, type ReactNode, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

/**
 * Provider reasoning is transport metadata, not chat content. Keeping an
 * unfinished block hidden also prevents streamed reasoning from flashing
 * briefly before its closing tag arrives.
 */
export function visibleAssistantText(content: string): string {
  if (!content) return "";
  const thinkMatch = content.match(/<think(?:ing)?\b[^>]*>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i);
  const reasoning = thinkMatch ? thinkMatch[1].trim() : "";
  const cleaned = content
    .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "")
    .replace(/<\/?think(?:ing)?\b[^>]*>/gi, "")
    .trim();

  if (cleaned) return cleaned;
  if (reasoning) return `💭 Suy luận Agent:\n${reasoning}`;
  return content.trim();
}

export async function openExternalUrl(url: string) {
  try {
    await invoke("open_external", { url: url.trim() });
  } catch (err) {
    console.warn("Tauri open_external invoke failed, fallback to window.open:", err);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const openLink = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
  e.preventDefault();
  e.stopPropagation();
  void openExternalUrl(url);
};

function inlineMarkdown(value: string): ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+[^<.,:;"')\s])/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-neutral-950/60 px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const mdLinkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (mdLinkMatch) {
      const text = mdLinkMatch[1];
      const url = mdLinkMatch[2];
      return (
        <a
          key={index}
          href={url}
          onClick={(e) => void openLink(e, url)}
          className="text-gold-400 hover:text-gold-300 underline cursor-pointer font-medium"
        >
          {text}
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={index}
          href={part}
          onClick={(e) => void openLink(e, part)}
          className="text-gold-400 hover:text-gold-300 underline cursor-pointer font-medium"
        >
          {part}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MessageContent({
  content,
  assistant,
  onApprovePermission,
}: {
  content: string;
  assistant: boolean;
  onApprovePermission?: (path: string) => void;
}) {
  const [permissionStatus, setPermissionStatus] = useState<"pending" | "approved" | "denied">("pending");
  const visible = assistant ? visibleAssistantText(content) : content;
  const lines = visible.split("\n");

  // Detect permission request or access failure path
  const pathMatch = content.match(/(?:Không thể truy cập|thư mục|tệp|path|PERMISSION_REQUEST[:\s]+)(?:`?)([\/][^\s`\n]+)/i);
  const detectedPath = pathMatch ? pathMatch[1] : null;

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-1" />;
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          return <h3 key={index} className="pt-1 text-sm font-semibold">{inlineMarkdown(heading[2])}</h3>;
        }
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet) {
          return <div key={index} className="flex gap-2"><span aria-hidden="true">•</span><span>{inlineMarkdown(bullet[1])}</span></div>;
        }
        const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (ordered) {
          return <div key={index} className="flex gap-2"><span className="shrink-0">{ordered[1]}.</span><span>{inlineMarkdown(ordered[2])}</span></div>;
        }
        return <p key={index}>{inlineMarkdown(line)}</p>;
      })}

      {assistant && detectedPath && onApprovePermission && (
        <div className="my-3 rounded-xl border border-amber-500/40 bg-neutral-950/90 p-3.5 shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
            <ShieldAlert className="size-4 text-amber-400 shrink-0" />
            <span>Yêu cầu xác nhận cấp quyền truy cập</span>
          </div>
          <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 font-mono text-xs text-amber-200/90 break-all">
            📁 {detectedPath}
          </div>
          {permissionStatus === "pending" && (
            <>
              <p className="mt-2 text-xs text-neutral-400">
                Nhấn <strong>Cho phép (Approve)</strong> để cấp quyền cho Agent tự động truy cập và xử lý dữ liệu trong thư mục này.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => {
                    setPermissionStatus("approved");
                    onApprovePermission(detectedPath);
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-500 active:scale-95"
                >
                  <CheckCircle2 className="size-3.5" /> Cho phép (Approve)
                </button>
                <button
                  onClick={() => setPermissionStatus("denied")}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
                >
                  <XCircle className="size-3.5" /> Từ chối (Deny)
                </button>
              </div>
            </>
          )}

          {permissionStatus === "approved" && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="size-4" /> Đã cấp quyền truy cập thành công! Agent đang tiến hành làm việc...
            </div>
          )}

          {permissionStatus === "denied" && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-400">
              <XCircle className="size-4" /> Đã từ chối quyền truy cập thư mục.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
