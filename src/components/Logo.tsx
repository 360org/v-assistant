import { cn } from "@/lib/utils";

/** The V Assistant mark: a gold rounded square with a V. */
export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 font-black text-neutral-950",
        className,
      )}
      aria-hidden
    >
      V
    </div>
  );
}
