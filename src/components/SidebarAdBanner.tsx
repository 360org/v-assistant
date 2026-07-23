import { useEffect, useState } from "react";
import { ArrowRight, Bot, ExternalLink, Zap } from "lucide-react";
import { openExternalUrl } from "@/components/MessageContent";
import { cn } from "@/lib/utils";

export interface BannerData {
  badge?: string;
  title?: string;
  subtitle?: string;
  ctaText?: string;
  linkUrl?: string;
  imageUrl?: string;
  bgGradient?: string;
}

const DEFAULT_BANNER: BannerData = {
  badge: "Vua AI — 360 CORP",
  title: "Thuê Nhân Sự AI 24/7",
  subtitle: "Xóa 6 rào cản tăng trưởng · Tích hợp Cloud ERP & 100+ công cụ",
  ctaText: "Khám phá 3 gói thuê",
  linkUrl: "https://vuaai.net/#pricing",
};

// Endpoints on vuaai.net to attempt fetching dynamic banner configs
const BANNER_ENDPOINTS = [
  "https://vuaai.net/api/v-assistant-banner",
  "https://vuaai.net/api/banner",
  "https://vuaai.net/banner.json",
];

export function SidebarAdBanner({ className }: { className?: string }) {
  const [banner, setBanner] = useState<BannerData>(DEFAULT_BANNER);

  useEffect(() => {
    let cancelled = false;

    const fetchBanner = async () => {
      for (const endpoint of BANNER_ENDPOINTS) {
        try {
          const res = await fetch(endpoint, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-cache",
          });
          if (res.ok) {
            const data = (await res.json()) as BannerData;
            if (!cancelled && data && (data.title || data.imageUrl)) {
              setBanner({
                badge: data.badge || DEFAULT_BANNER.badge,
                title: data.title || DEFAULT_BANNER.title,
                subtitle: data.subtitle || DEFAULT_BANNER.subtitle,
                ctaText: data.ctaText || DEFAULT_BANNER.ctaText,
                linkUrl: data.linkUrl || DEFAULT_BANNER.linkUrl,
                imageUrl: data.imageUrl,
                bgGradient: data.bgGradient,
              });
              return;
            }
          }
        } catch {
          /* try next endpoint or stick to default fallback */
        }
      }
    };

    void fetchBanner();

    // Check for updated banner from vuaai.net backend every 15 minutes or on focus
    const interval = window.setInterval(fetchBanner, 15 * 60 * 1000);
    const onFocus = () => void fetchBanner();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const handleBannerClick = () => {
    const url = banner.linkUrl || "https://vuaai.net";
    void openExternalUrl(url);
  };

  return (
    <div
      onClick={handleBannerClick}
      className={cn(
        "group relative mx-1 my-2 cursor-pointer overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-neutral-900 via-neutral-950 to-emerald-950/40 p-3.5 shadow-xl transition-all duration-300 hover:border-emerald-400/60 hover:shadow-emerald-500/15 hover:-translate-y-0.5",
        className,
      )}
    >
      {/* Background Ambient Glow & Grid Lines */}
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-emerald-500/15 blur-xl group-hover:bg-emerald-400/25 transition-all duration-500" />
      <div className="pointer-events-none absolute -bottom-6 -left-6 size-20 rounded-full bg-cyan-500/10 blur-xl" />

      {banner.imageUrl ? (
        /* If custom image banner is uploaded from backend */
        <div className="flex flex-col gap-2">
          <img
            src={banner.imageUrl}
            alt={banner.title || "Vua AI Banner"}
            className="w-full rounded-xl object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          {banner.ctaText && (
            <div className="flex items-center justify-between text-xs font-bold text-emerald-400 pt-1">
              <span>{banner.ctaText}</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          )}
        </div>
      ) : (
        /* Standard Rich Dynamic Card Layout */
        <div className="relative z-10 flex flex-col gap-2.5">
          {/* Badge & Live Status */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 backdrop-blur-xs">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
              </span>
              {banner.badge}
            </span>
            <ExternalLink className="size-3 text-neutral-500 transition-colors group-hover:text-emerald-400" />
          </div>

          {/* Title & Subtitle */}
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-bold leading-snug text-neutral-100 group-hover:text-emerald-300 transition-colors">
              <Bot className="size-4 shrink-0 text-emerald-400" />
              {banner.title}
            </h4>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-neutral-400 line-clamp-2">
              {banner.subtitle}
            </p>
          </div>

          {/* Call to action Button */}
          <div className="mt-0.5 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 transition-colors group-hover:border-emerald-400/40 group-hover:bg-emerald-400/20 group-hover:text-emerald-200">
            <span className="flex items-center gap-1">
              <Zap className="size-3 text-emerald-400" />
              {banner.ctaText}
            </span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      )}
    </div>
  );
}
