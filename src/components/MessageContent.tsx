import { Fragment, type ReactNode } from "react";

/**
 * Provider reasoning is transport metadata, not chat content. Keeping an
 * unfinished block hidden also prevents streamed reasoning from flashing
 * briefly before its closing tag arrives.
 */
export function visibleAssistantText(content: string): string {
  return content
    .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "")
    .replace(/<\/?think(?:ing)?\b[^>]*>/gi, "")
    .trim();
}

function inlineMarkdown(value: string): ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-neutral-950/60 px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MessageContent({ content, assistant }: { content: string; assistant: boolean }) {
  const visible = assistant ? visibleAssistantText(content) : content;
  const lines = visible.split("\n");

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
    </div>
  );
}
