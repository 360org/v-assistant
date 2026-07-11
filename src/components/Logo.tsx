import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

/** The V Assistant brand mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt=""
      draggable={false}
      className={cn("size-8 select-none", className)}
      aria-hidden
    />
  );
}
