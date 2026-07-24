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
  settings:     'Configurações',
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
    local:      { label: 'Local',      cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    staging:    { label: 'Staging',    cls: 'bg-amber-50  text-amber-700  border-amber-200' },
    production: { label: 'Production', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  }[env] ?? { label: env, cls: 'bg-slate-100 text-slate-600 border-slate-200' };

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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu do usuário"
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-white font-semibold text-[10px]">CC</span>
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-[13px] font-semibold text-slate-800 leading-tight">Me. Cristóvão Costa</div>
          <div className="text-[11px] text-slate-500 font-medium">Pesquisador Assistente · UFPE</div>
        </div>
        <ChevronDown size={13} className="text-slate-400 hidden sm:block" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute right-0 top-full mt-1.5 z-20 w-56',
              'bg-white rounded-xl border border-slate-200 shadow-dropdown',
              'animate-scale-in',
            )}
          >
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-800">Me. Cristóvão Costa</div>
              <div className="text-xs text-slate-500 mt-0.5">pesquisador@instituicao.edu.br</div>
            </div>
            <div className="py-1">
              <MenuItem icon={User} label="Meu Perfil"       onClick={() => { navigate('/app/settings'); setOpen(false); }} />
              <MenuItem icon={Building2} label="Organização" onClick={() => { navigate('/app/settings'); setOpen(false); }} />
              <MenuItem icon={Settings} label="Configurações" onClick={() => { navigate('/app/settings'); setOpen(false); }} />
            </div>
            <div className="border-t border-slate-100 py-1">
              <MenuItem
                icon={LogOut}
                label="Sair"
                className="text-red-600 hover:bg-red-50"
                onClick={() => { navigate('/login'); setOpen(false); }}
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
        'flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700',
        'hover:bg-slate-50 transition-colors text-left',
        className,
      )}
    >
      <Icon size={14} className="shrink-0 text-slate-400" />
      {label}
    </button>
  );
}

// ─── Topbar Component ─────────────────────────────────────────

export function Topbar() {
  const crumbs = useBreadcrumbs();
  const { setMobileOpen } = useSidebarStore();
  const navigate = useNavigate();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4 shrink-0 z-10">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
        className="lg:hidden p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* ── Breadcrumbs ──────────────────────────────────── */}
      <nav className="flex items-center gap-1 flex-1 min-w-0" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => (
          <div key={crumb.path} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight size={13} className="text-slate-300 shrink-0" />}
            {crumb.isLast ? (
              <span className="text-sm font-semibold text-slate-800 truncate">{crumb.label}</span>
            ) : (
              <button
                onClick={() => navigate(crumb.path)}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors truncate"
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
        <div className="relative hidden md:flex items-center">
          <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar projeto, estudo, sessão ou vídeo... ⌘K"
            aria-label="Busca global"
            className={cn(
              'w-64 lg:w-80 pl-8 pr-3 py-1.5 text-sm bg-slate-50 rounded-lg',
              'border border-slate-200 text-slate-700 placeholder:text-slate-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
              'transition-all duration-200',
            )}
          />
        </div>

        {/* Environment badge */}
        <EnvBadge />

        <div className="w-px h-5 bg-slate-200" />

        {/* Notifications */}
        <button
          aria-label="Notificações (3 pendentes)"
          className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <Bell size={17} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
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

        <div className="w-px h-5 bg-slate-200" />

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
