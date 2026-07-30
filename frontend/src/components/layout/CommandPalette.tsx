import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  FolderKanban,
  FlaskConical,
  Users,
  CalendarClock,
  Video,
  Cpu,
  PenLine,
  LineChart,
  Database,
  Brain,
  BarChart3,
  ShieldCheck,
  Settings,
  CornerDownLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Command {
  label: string;
  hint: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  keywords?: string;
}

// Destinations mirror the sidebar so ⌘K reaches every top-level section.
const COMMANDS: Command[] = [
  { label: 'Visão geral',   hint: 'Dashboard',            path: '/app',             icon: LayoutDashboard, keywords: 'home inicio dashboard' },
  { label: 'Projetos',      hint: 'Pesquisa',             path: '/app/projects',    icon: FolderKanban },
  { label: 'Estudos',       hint: 'Pesquisa',             path: '/app/studies',     icon: FlaskConical },
  { label: 'Participantes', hint: 'Pesquisa',             path: '/app/participants', icon: Users, keywords: 'sujeitos voluntarios' },
  { label: 'Sessões',       hint: 'Pesquisa',             path: '/app/sessions',    icon: CalendarClock },
  { label: 'Aquisição',     hint: 'Dados multimodais',    path: '/app/acquisition', icon: Video, keywords: 'upload video eeg' },
  { label: 'Vídeos',        hint: 'Dados multimodais',    path: '/app/videos',      icon: Video },
  { label: 'Processamento', hint: 'Dados multimodais',    path: '/app/processing',  icon: Cpu, keywords: 'fila jobs' },
  { label: 'Anotação',      hint: 'Dados multimodais',    path: '/app/annotations', icon: PenLine, keywords: 'rotulagem labels' },
  { label: 'Análises',      hint: 'Dados multimodais',    path: '/app/analysis',    icon: LineChart },
  { label: 'Datasets',      hint: 'Ciência & modelos',    path: '/app/datasets',    icon: Database },
  { label: 'Modelos',       hint: 'Ciência & modelos',    path: '/app/models',      icon: Brain, keywords: 'lstm treino inferencia' },
  { label: 'Relatórios',    hint: 'Ciência & modelos',    path: '/app/reports',     icon: BarChart3 },
  { label: 'Governança',    hint: 'Governança',           path: '/app/governance',  icon: ShieldCheck, keywords: 'lgpd privacidade consentimento' },
  { label: 'Auditoria',     hint: 'Governança',           path: '/app/audit',       icon: ShieldCheck, keywords: 'logs trilha' },
  { label: 'Administração', hint: 'Governança',           path: '/app/settings',    icon: Settings, keywords: 'configuracoes usuarios' },
];

// Accent-insensitive matching so "anotacao" finds "Anotação".
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) =>
      normalize(`${c.label} ${c.hint} ${c.keywords ?? ''}`).includes(q),
    );
  }, [query]);

  // Focus the input once the portal has painted. Query/highlight state needs no
  // reset effect: the parent remounts this component per open via `key`.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Keep the highlighted row in view while arrowing through results. Reading
  // the DOM node is a side effect on an external system, not a state update.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, results.length]);

  if (!open) return null;

  // Clamp instead of resetting via an effect when the result set shrinks.
  const activeIndex = active < results.length ? active : 0;

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.path);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        onKeyDown={onKeyDown}
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-xl border border-border',
          'bg-surface shadow-modal animate-scale-in',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar seções da plataforma..."
            aria-label="Buscar seções da plataforma"
            aria-controls="command-palette-list"
            aria-activedescendant={results[activeIndex] ? `command-${activeIndex}` : undefined}
            className={cn(
              'w-full bg-transparent py-3.5 text-sm text-text-primary',
              'placeholder:text-text-muted focus:outline-none',
            )}
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            ESC
          </kbd>
        </div>

        <div
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[min(22rem,50vh)] overflow-y-auto p-1.5"
        >
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-text-muted">
              Nenhuma seção encontrada para “{query}”.
            </p>
          )}

          {results.map((cmd, i) => (
            <button
              key={cmd.path}
              id={`command-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === activeIndex}
              type="button"
              onClick={() => go(cmd.path)}
              onMouseMove={() => setActive(i)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                i === activeIndex ? 'bg-surface-muted' : 'hover:bg-surface-hover',
              )}
            >
              <cmd.icon size={15} className="shrink-0 text-text-muted" aria-hidden="true" />
              <span className="flex-1 truncate text-[13px] font-medium text-text-primary">
                {cmd.label}
              </span>
              <span className="shrink-0 text-[11px] text-text-muted">{cmd.hint}</span>
              {i === activeIndex && (
                <CornerDownLeft size={12} className="shrink-0 text-text-muted" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
