import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/brand/BrandMark";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { AuthBrandPanel } from "./AuthBrandPanel";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation(["auth", "common"]);

  return (
    <div className="flex min-h-screen bg-app-bg">
      {/* Brand story — wide screens only; phones get the compact mark below. */}
      <aside className="hidden lg:block lg:w-5/12 xl:w-1/2">
        <AuthBrandPanel />
      </aside>

      <main className="flex w-full flex-col lg:w-7/12 xl:w-1/2">
        <div className="flex items-center gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
          <div className="flex items-center gap-2 lg:hidden">
            <BrandMark className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight text-text-primary">
              {t("common:brand.name")}
            </span>
          </div>

          {/* Chosen before signing in, and kept for the whole app. */}
          <div
            role="group"
            aria-label={t("auth:preferences")}
            className="ml-auto flex items-center gap-2"
          >
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-violet-500"
            />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
