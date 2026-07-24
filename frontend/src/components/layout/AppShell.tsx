import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useSidebarStore } from '@/app/stores/useSidebarStore';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { isMobileOpen, setMobileOpen } = useSidebarStore();

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      {/* ── Mobile backdrop ──────────────────────────────── */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar (desktop: sticky, mobile: drawer) ────── */}
      <div
        className={cn(
          'flex-shrink-0 h-full',
          // Mobile: fixed drawer
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-30',
          'max-lg:transition-transform max-lg:duration-300',
          !isMobileOpen && 'max-lg:-translate-x-full',
        )}
      >
        <Sidebar />
      </div>

      {/* ── Main content area ────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <Topbar />

        {/* Page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
