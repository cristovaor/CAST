import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  ChevronRight,
  ChevronDown,
  Menu,
  Plus,
  User,
  LogOut,
  Settings,
  Building2,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/app/stores/useSidebarStore';
import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { ThemeMenu } from '@/components/ui/ThemeSwitcher';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { roleLabel } from '@/lib/formatters';
import { translate } from '@/i18n/labels';
import { useLogout, useMe } from '@/features/auth/useAuth';
import { useJobs } from '@/features/jobs/useJobActions';
import { CommandPalette } from './CommandPalette';
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog';

// ─── Breadcrumb generator ─────────────────────────────────────

function useBreadcrumbs() {
  useTranslation('nav');
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  return segments.map((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    // If looks like a UUID/ID, show a shortened version
    const isId = /^[0-9a-f-]{8,}$/i.test(seg);
    const key = `nav:breadcrumbs.${seg}`;
    const label = isId
      ? `#${seg.slice(0, 6).toUpperCase()}`
      : i18n.exists(key) ? translate(key) : seg;
    return { label, path, isLast: i === segments.length - 1 };
  });
}

// ─── Environment badge ────────────────────────────────────────

function EnvBadge() {
  const { t } = useTranslation('nav');
  const env = (import.meta.env.VITE_ENV as string | undefined) ?? 'local';
  const config = {
    local:      { label: t('env.local'),      cls: 'bg-surface-muted text-text-secondary border-border' },
    staging:    { label: t('env.staging'),    cls: 'bg-amber-50  text-amber-700  border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
    production: { label: t('env.production'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  }[env] ?? { label: env, cls: 'bg-surface-muted text-text-secondary border-border' };

  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', config.cls)}>
      {config.label}
    </span>
  );
}

// ─── Notifications ────────────────────────────────────────────

/**
 * Surfaces in-flight processing as a badge count and links to the queue.
 * The count comes from the same polling `useJobs` query the queue page uses.
 */
function NotificationsBell() {
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  const { data: jobs } = useJobs();

  const active = (jobs ?? []).filter(
    (job) => job.status === 'queued' || job.status === 'running',
  ).length;
  const failed = (jobs ?? []).filter((job) => job.status === 'failed').length;
  const count = active + failed;

  const label = count === 0
    ? t('topbar.notificationsIdle')
    : t('topbar.notificationsActive', { active, failed });

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => navigate('/app/processing')}
      className="relative p-2 rounded-lg hover:bg-surface-muted text-text-secondary transition-colors"
    >
      <Bell size={17} aria-hidden="true" />
      {count > 0 && (
        <span
          className={cn(
            'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
            'text-[9px] font-bold text-white ring-2 ring-surface',
            failed > 0 ? 'bg-red-500' : 'bg-blue-600',
          )}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

// ─── User Menu ────────────────────────────────────────────────

function UserMenu() {
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: user } = useMe();

  const initials = user?.name
    ?.split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
  const role = roleLabel(user?.role);
  const userName = user?.name ?? t('sidebar.user');

  const itemClass = cn(
    'flex items-center gap-2.5 w-full px-4 py-2 text-sm text-text-secondary cursor-pointer',
    'outline-none data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary transition-colors',
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t('topbar.userMenu')}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-white font-semibold text-[10px]">{initials}</span>
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-[13px] font-semibold text-text-primary leading-tight">{userName}</div>
            <div className="text-[11px] text-text-secondary font-medium">{role}</div>
          </div>
          <ChevronDown size={13} className="text-text-muted hidden sm:block" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            'z-50 w-56 overflow-hidden bg-surface rounded-xl border border-border shadow-dropdown',
            'animate-scale-in',
          )}
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="text-sm font-semibold text-text-primary truncate">{userName}</div>
            <div className="text-xs text-text-secondary mt-0.5 truncate">{user?.email ?? ''}</div>
          </div>

          <div className="py-1">
            <DropdownMenu.Item className={itemClass} onSelect={() => navigate('/app/settings')}>
              <User size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
              {t('topbar.profile')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={() => navigate('/app/settings')}>
              <Building2 size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
              {t('topbar.organization')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={() => navigate('/app/governance')}>
              <Settings size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
              {t('topbar.governance')}
            </DropdownMenu.Item>
          </div>

          <DropdownMenu.Separator className="h-px bg-border" />

          <div className="py-1">
            <DropdownMenu.Item
              className={cn(itemClass, 'text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700 dark:text-red-400 dark:data-[highlighted]:bg-red-950/40 dark:data-[highlighted]:text-red-300')}
              onSelect={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut size={14} className="shrink-0" aria-hidden="true" />
              {t('topbar.signOut')}
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Topbar Component ─────────────────────────────────────────

export function Topbar() {
  const { t } = useTranslation('nav');
  const crumbs = useBreadcrumbs();
  const { setMobileOpen } = useSidebarStore();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // ⌘K / Ctrl+K opens the palette the search field advertises.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center gap-3 px-4 shrink-0 z-10">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t('topbar.openMenu')}
        className="lg:hidden p-1.5 rounded-md hover:bg-surface-muted text-text-secondary transition-colors"
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      {/* ── Breadcrumbs ──────────────────────────────────── */}
      <nav className="flex items-center gap-1 flex-1 min-w-0" aria-label={t('topbar.breadcrumb')}>
        {crumbs.map((crumb, i) => (
          <div key={crumb.path} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight size={13} className="text-text-disabled shrink-0" aria-hidden="true" />}
            {crumb.isLast ? (
              <span aria-current="page" className="text-sm font-semibold text-text-primary truncate">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(crumb.path)}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors truncate"
              >
                {crumb.label}
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* ── Right actions ─────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Global search — opens the command palette */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label={t('topbar.search')}
          className={cn(
            'hidden md:flex items-center gap-2 w-64 lg:w-80 pl-3 pr-2 py-1.5',
            'bg-surface-muted rounded-lg border border-border text-left',
            'hover:border-border-strong transition-colors',
          )}
        >
          <Search size={14} className="text-text-muted shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate text-sm text-text-muted">{t('topbar.searchPlaceholder')}</span>
          <kbd className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            Ctrl K
          </kbd>
        </button>

        {/* Environment badge */}
        <EnvBadge />

        <div className="w-px h-5 bg-border" />

        <LanguageSwitcher compact />
        <ThemeMenu />

        <div className="w-px h-5 bg-border" />

        <NotificationsBell />

        {/* Primary action */}
        <div className="hidden sm:block">
          <ActionButton
            variant="primary"
            icon={Plus}
            onClick={() => setCreateProjectOpen(true)}
          >
            {t('topbar.newProject')}
          </ActionButton>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* User menu */}
        <UserMenu />
      </div>

      {/* keyed by open count so each opening starts with a fresh query */}
      <CommandPalette
        key={paletteOpen ? 'open' : 'closed'}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
    </header>
  );
}
