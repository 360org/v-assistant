import { useEffect, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, ExternalLink, Zap } from "lucide-react";
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
  features?: string[];
}

const DEFAULT_BANNER: BannerData = {
  badge: "VUA AI — 360 CORP",
  title: "Thuê Nhân Sự AI 24/7",
  subtitle: "Giải pháp bứt phá doanh số & tự động hóa vận hành toàn diện",
  ctaText: "Khám phá 3 gói thuê ngay",
  linkUrl: "https://vuaai.net/#pricing",
  features: [
    "Xóa 6 rào cản tăng trưởng",
    "Tích hợp Cloud ERP & 100+ App",
    "Triển khai nhanh trong 7 ngày",
  ],
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
                features: data.features || DEFAULT_BANNER.features,
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

  const featuresList = banner.features || DEFAULT_BANNER.features || [];

  return (
    <div
      onClick={handleBannerClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-neutral-900 via-emerald-950/30 to-neutral-950 p-4 shadow-2xl transition-all duration-300 hover:border-emerald-400 hover:shadow-emerald-500/25 flex flex-col justify-between min-h-[240px]",
        className,
      )}
    >
      {/* Ambient Glows */}
      <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-emerald-500/20 blur-2xl group-hover:bg-emerald-400/30 transition-all duration-500" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 size-28 rounded-full bg-cyan-500/15 blur-2xl" />

      {banner.imageUrl ? (
        /* If custom image banner is uploaded from backend */
        <div className="flex h-full flex-col justify-between gap-3">
          <img
            src={banner.imageUrl}
            alt={banner.title || "Vua AI Banner"}
            className="w-full rounded-xl object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          {banner.ctaText && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors group-hover:bg-emerald-500/25">
              <span>{banner.ctaText}</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
          )}
        </div>
      ) : (
        /* Rich Poster Format Banner */
        <div className="relative z-10 flex flex-col justify-between h-full gap-3">
          {/* Header & Badge */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300 shadow-sm backdrop-blur-xs">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                {banner.badge}
              </span>
              <ExternalLink className="size-3.5 text-neutral-500 transition-colors group-hover:text-emerald-400" />
            </div>

            <h4 className="mt-1 flex items-center gap-2 text-sm font-extrabold text-neutral-100 group-hover:text-emerald-300 transition-colors">
              <Bot className="size-5 shrink-0 text-emerald-400" />
              {banner.title}
            </h4>

            {banner.subtitle && (
              <p className="text-[11px] font-medium leading-relaxed text-neutral-400">
                {banner.subtitle}
              </p>
            )}
          </div>

          {/* Key Advantage Bullet Points */}
          <div className="flex flex-col gap-1.5 my-1 rounded-xl border border-emerald-500/15 bg-neutral-900/60 p-2.5">
            {featuresList.map((feature, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] font-medium text-neutral-300">
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />
                <span className="leading-tight">{feature}</span>
              </div>
            ))}
          </div>

          {/* Call to Action Button */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 to-emerald-600/30 px-3 py-2 text-xs font-extrabold text-emerald-200 transition-all duration-300 group-hover:border-emerald-400/60 group-hover:from-emerald-500/30 group-hover:to-emerald-600/40 group-hover:text-white shadow-md">
            <span className="flex items-center gap-1.5">
              <Zap className="size-3.5 text-emerald-400 fill-emerald-400" />
              {banner.ctaText}
            </span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 text-emerald-300" />
          </div>
        </div>
      )}
    </div>
  );
}
