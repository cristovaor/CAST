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
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/app/stores/useSidebarStore';
import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useLogout, useMe } from '@/features/auth/useAuth';

// ─── Breadcrumb generator ─────────────────────────────────────

const PATH_LABELS: Record<string, string> = {
  app:          'Dashboard',
  projects:     'Projetos',
  studies:      'Estudos',
  sessions:     'Sessões',
  videos:       'Vídeos',
  processing:   'Processamentos',
  models:       'Modelos',
  annotations:  'Anotações',
  reports:      'Relatórios',
  audit:        'Auditoria',
  settings:     'Administração',
  analysis:     'Análises',
  new:          'Novo',
  overview:     'Visão Geral',
  participants: 'Participantes',
  timeline:     'Timeline',
};

function useBreadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  return segments.map((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    // If looks like a UUID/ID, show a shortened version
    const isId = /^[0-9a-f-]{8,}$/i.test(seg);
    const label = isId ? `#${seg.slice(0, 6).toUpperCase()}` : (PATH_LABELS[seg] ?? seg);
    return { label, path, isLast: i === segments.length - 1 };
  });
}

// ─── Environment badge ────────────────────────────────────────

function EnvBadge() {
  const env = (import.meta.env.VITE_ENV as string | undefined) ?? 'local';
  const config = {
    local:      { label: 'Local',      cls: 'bg-surface-muted text-text-secondary border-border' },
    staging:    { label: 'Staging',    cls: 'bg-amber-50  text-amber-700  border-amber-200' },
    production: { label: 'Production', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  }[env] ?? { label: env, cls: 'bg-surface-muted text-text-secondary border-border' };

  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', config.cls)}>
      {config.label}
    </span>
  );
}

// ─── User Menu ────────────────────────────────────────────────

function UserMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: user } = useMe();
  const initials = user?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
  const roleLabel = {
    admin: 'Administrador',
    researcher: 'Pesquisador',
    annotator: 'Anotador',
    viewer: 'Leitor',
  }[user?.role ?? 'viewer'];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu do usuário"
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-muted transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-white font-semibold text-[10px]">{initials}</span>
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-[13px] font-semibold text-text-primary leading-tight">{user?.name ?? 'Usuário'}</div>
          <div className="text-[11px] text-text-secondary font-medium">{roleLabel}</div>
        </div>
        <ChevronDown size={13} className="text-text-muted hidden sm:block" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute right-0 top-full mt-1.5 z-20 w-56',
              'bg-surface rounded-xl border border-border shadow-dropdown',
              'animate-scale-in',
            )}
          >
            <div className="px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold text-text-primary">{user?.name ?? 'Usuário'}</div>
              <div className="text-xs text-text-secondary mt-0.5">{user?.email ?? ''}</div>
            </div>
            <div className="py-1">
              <MenuItem icon={User} label="Meu Perfil"       onClick={() => { navigate('/app/settings'); setOpen(false); }} />
              <MenuItem icon={Building2} label="Organização" onClick={() => { navigate('/app/settings'); setOpen(false); }} />
              <MenuItem icon={Settings} label="Administração" onClick={() => { navigate('/app/settings'); setOpen(false); }} />
            </div>
            <div className="border-t border-border py-1">
              <MenuItem
                icon={LogOut}
                label="Sair"
                className="text-red-600 hover:bg-red-50"
                onClick={() => { logout(); navigate('/login', { replace: true }); setOpen(false); }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 w-full px-4 py-2 text-sm text-text-secondary',
        'hover:bg-surface-hover transition-colors text-left',
        className,
      )}
    >
      <Icon size={14} className="shrink-0 text-text-muted" />
      {label}
    </button>
  );
}

// ─── Topbar Component ─────────────────────────────────────────

export function Topbar() {
  const crumbs = useBreadcrumbs();
  const { setMobileOpen } = useSidebarStore();
  const navigate = useNavigate();
  const [globalSearch, setGlobalSearch] = useState('');

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center gap-3 px-4 shrink-0 z-10">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
        className="lg:hidden p-1.5 rounded-md hover:bg-surface-muted text-text-secondary transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* ── Breadcrumbs ──────────────────────────────────── */}
      <nav className="flex items-center gap-1 flex-1 min-w-0" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => (
          <div key={crumb.path} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight size={13} className="text-text-disabled shrink-0" />}
            {crumb.isLast ? (
              <span className="text-sm font-semibold text-text-primary truncate">{crumb.label}</span>
            ) : (
              <button
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
        {/* Global search */}
        <form
          className="relative hidden md:flex items-center"
          onSubmit={(event) => {
            event.preventDefault();
            const query = globalSearch.trim();
            if (query) navigate(`/app/projects?search=${encodeURIComponent(query)}`);
          }}
        >
          <Search size={14} className="absolute left-3 text-text-muted pointer-events-none" />
          <input
            type="search"
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            placeholder="Buscar projeto, estudo, sessão ou vídeo... ⌘K"
            aria-label="Busca global"
            className={cn(
              'w-64 lg:w-80 pl-8 pr-3 py-1.5 text-sm bg-surface-muted rounded-lg',
              'border border-border text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
              'transition-all duration-200',
            )}
          />
        </form>

        {/* Environment badge */}
        <EnvBadge />

        <div className="w-px h-5 bg-border" />

        <ThemeToggle />

        <div className="w-px h-5 bg-border" />

        {/* Notifications */}
        <button
          aria-label="Abrir fila de processamento"
          onClick={() => navigate('/app/processing')}
          className="relative p-2 rounded-lg hover:bg-surface-muted text-text-secondary transition-colors"
        >
          <Bell size={17} />
        </button>

        {/* Primary action */}
        <div className="hidden sm:block">
          <ActionButton
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/app/projects')}
          >
            Novo Projeto
          </ActionButton>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
