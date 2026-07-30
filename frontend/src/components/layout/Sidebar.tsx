import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  FlaskConical,
  Users,
  Video,
  PenLine,
  Cpu,
  Brain,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building2,
  LogOut,
  CalendarClock,
  Waypoints,
  LineChart,
  Database,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/app/stores/useSidebarStore';
import { useLogout, useMe } from '@/features/auth/useAuth';

// ─── Nav item types ───────────────────────────────────────────

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ─── Navigation structure ─────────────────────────────────────

// 14-section architecture (docs §6): a configurable, reusable scientific
// environment for synchronized multimodal analysis (video + EEG + events).
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      { label: 'Visão geral',    path: '/app',             icon: LayoutDashboard },
    ],
  },
  {
    label: 'Pesquisa',
    items: [
      { label: 'Projetos',       path: '/app/projects',    icon: FolderKanban },
      { label: 'Estudos',        path: '/app/studies',     icon: FlaskConical },
      { label: 'Participantes',  path: '/app/participants', icon: Users },
      { label: 'Sessões',        path: '/app/sessions',    icon: CalendarClock },
    ],
  },
  {
    label: 'Dados multimodais',
    items: [
      { label: 'Aquisição',      path: '/app/acquisition', icon: Video },
      { label: 'Processamento',  path: '/app/processing',  icon: Cpu },
      { label: 'Anotação',       path: '/app/annotations', icon: PenLine },
      { label: 'Análises',       path: '/app/analysis',    icon: LineChart },
    ],
  },
  {
    label: 'Ciência & modelos',
    items: [
      { label: 'Datasets',       path: '/app/datasets',    icon: Database },
      { label: 'Modelos',        path: '/app/models',      icon: Brain },
      { label: 'Relatórios',     path: '/app/reports',     icon: BarChart3 },
    ],
  },
  {
    label: 'Governança',
    items: [
      { label: 'Governança',     path: '/app/governance',  icon: ShieldCheck },
      { label: 'Administração',  path: '/app/settings',    icon: Settings },
    ],
  },
];

// Referenced icons kept for future contextual nav (sync / modalities).
void Waypoints; void Layers;

// ─── Sidebar Component ────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  researcher: 'Pesquisador',
  annotator: 'Anotador',
  viewer: 'Leitor',
};

function initialsOf(name?: string) {
  if (!name) return 'U';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'U';
}

export function Sidebar() {
  const { isCollapsed, toggle } = useSidebarStore();
  const navigate = useNavigate();
  const { data: user } = useMe();
  const logout = useLogout();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const userName = user?.name ?? 'Usuário';
  const userRole = ROLE_LABELS[user?.role ?? 'viewer'] ?? 'Leitor';
  const initials = initialsOf(user?.name);

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-[#0F172A] border-r border-[#1E293B]',
        'transition-all duration-300 ease-in-out overflow-hidden',
        isCollapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* ── Logo / Wordmark ────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center h-14 px-4 border-b border-[#1E293B] shrink-0',
          isCollapsed ? 'justify-center' : 'gap-2.5',
        )}
      >
        {/* Logo mark */}
        <div
          className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 cursor-pointer"
          onClick={() => navigate('/app')}
        >
          <span className="text-white font-bold text-xs leading-none tracking-tight">C</span>
        </div>

        {/* Wordmark */}
        {!isCollapsed && (
          <div className="animate-fade-in min-w-0">
            <div className="text-white font-semibold text-sm leading-tight tracking-tight">CAST Pro</div>
            <div className="text-[#64748B] text-[10px] leading-tight font-medium tracking-wide">Cognitive Analysis System</div>
          </div>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-none">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            {/* Group label */}
            {!isCollapsed && (
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#334155]">
                  {group.label}
                </span>
              </div>
            )}

            {/* Items */}
            {group.items.map((item) => (
              <SidebarItem
                key={item.path}
                item={item}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="border-t border-[#1E293B] p-3 shrink-0">
        {!isCollapsed ? (
          <div className="animate-fade-in">
            {/* Organization */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md mb-1">
              <div className="w-5 h-5 rounded bg-[#1E293B] flex items-center justify-center shrink-0">
                <Building2 size={11} className="text-[#64748B]" />
              </div>
              <span className="text-[11px] text-[#64748B] truncate font-medium">
                {user?.organization?.name ?? '—'}
              </span>
            </div>

            {/* User — click to sign out */}
            <button
              type="button"
              onClick={handleLogout}
              title={`Sair (${userName})`}
              className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#1E293B] group transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <span className="text-blue-400 font-semibold text-[9px]">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[#CBD5E1] font-medium truncate">{userName}</div>
                <div className="text-[9px] text-[#475569] truncate">{userRole}</div>
              </div>
              <LogOut size={13} className="text-[#334155] group-hover:text-[#64748B] transition-colors shrink-0" aria-hidden="true" />
              <span className="sr-only">Sair</span>
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleLogout}
              aria-label={`Sair (${userName})`}
              title={`Sair (${userName})`}
              className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center hover:bg-blue-600/30 transition-colors"
            >
              <span className="text-blue-400 font-semibold text-[9px]">{initials}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Collapse toggle ─────────────────────────────────── */}
      <button
        onClick={toggle}
        aria-label={isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        className={cn(
          'absolute top-[52px] -right-3 z-10',
          'w-6 h-6 rounded-full bg-[#1E293B] border border-[#334155]',
          'flex items-center justify-center',
          'hover:bg-[#2D3748] transition-colors duration-150',
          'shadow-md',
        )}
      >
        {isCollapsed
          ? <ChevronRight size={12} className="text-[#64748B]" />
          : <ChevronLeft  size={12} className="text-[#64748B]" />
        }
      </button>
    </aside>
  );
}

// ─── Sidebar Item ─────────────────────────────────────────────

function SidebarItem({
  item,
  isCollapsed,
}: {
  item: NavItem;
  isCollapsed: boolean;
}) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/app'}
      title={isCollapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 mx-2 px-2 py-[7px] rounded-md',
          'text-sm transition-all duration-150 group',
          isActive
            ? 'bg-[#1E293B] text-white sidebar-item-active before:absolute before:left-[-8px] before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:bg-blue-500 before:rounded-r-md'
            : 'text-[#94A3B8] hover:bg-[#172033] hover:text-[#CBD5E1]',
          isCollapsed && 'justify-center px-0 mx-1.5 before:left-[-6px]',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            size={16}
            className={cn(
              'shrink-0 transition-colors',
              isActive ? 'text-blue-400' : 'text-[#475569] group-hover:text-[#64748B]',
            )}
          />
          {!isCollapsed && (
            <span className="animate-fade-in font-medium text-[13px] truncate">
              {item.label}
            </span>
          )}
          {item.badge !== undefined && item.badge > 0 && !isCollapsed && (
            <span className="ml-auto bg-red-500/20 text-red-400 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
