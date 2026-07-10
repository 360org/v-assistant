import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "gold" | "green";

const tones: Record<Tone, string> = {
  neutral: "bg-neutral-800 text-neutral-300",
  gold: "bg-gold-400/15 text-gold-300",
  green: "bg-emerald-500/15 text-emerald-400",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
