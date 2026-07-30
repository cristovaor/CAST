import { AuthBrandPanel } from "./AuthBrandPanel";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-app-bg selection:bg-blue-100 selection:text-blue-900">
      <div className="flex w-full">
        {/* Left Column - Branding (Hidden on mobile) */}
        <div className="hidden lg:block lg:w-5/12 xl:w-1/2">
          <AuthBrandPanel />
        </div>

        {/* Right Column - Login Form */}
        <div className="flex w-full items-center justify-center lg:w-7/12 xl:w-1/2 p-6 sm:p-12">
          <div className="w-full max-w-md bg-surface p-8 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl border border-border relative">
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-violet-500 rounded-t-2xl" />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
