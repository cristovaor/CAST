import { ShieldCheck, Activity, Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/brand/BrandMark";

const FEATURES = [
  { key: "pipeline", icon: Activity },
  { key: "governance", icon: ShieldCheck },
  { key: "quality", icon: Gauge },
] as const;

const BADGES = ["lgpd", "audit", "registry", "research"] as const;

/**
 * Always dark, whatever the theme: it is a brand surface, and its colours are
 * picked for contrast on slate-900 rather than taken from the theme tokens.
 */
export function AuthBrandPanel() {
  const { t } = useTranslation(["auth", "common"]);

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,theme(colors.blue.800/40%),transparent_50%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxjaXJjbGUgY3g9IjEiIGN5PSIxIiByPSIxIiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20"
      />

      <div className="relative flex items-center gap-3 text-2xl font-bold tracking-tight">
        <BrandMark className="h-9 w-9" />
        {t("common:brand.name")}
      </div>

      <div className="relative mb-10 mt-auto max-w-md space-y-8">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-wider text-blue-300">
            {t("auth:brand.eyebrow")}
          </p>
          <p className="text-3xl font-bold leading-tight tracking-tight text-white">
            {t("auth:brand.headline")}
          </p>
          <p className="text-lg leading-relaxed text-slate-300">
            {t("auth:brand.description")}
          </p>
        </div>

        <ul className="space-y-4 text-sm text-slate-300">
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {t(`auth:brand.features.${key}`)}
            </li>
          ))}
        </ul>
      </div>

      <ul className="relative flex flex-wrap gap-2">
        {BADGES.map((key) => (
          <li
            key={key}
            className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-300"
          >
            {t(`auth:brand.badges.${key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
