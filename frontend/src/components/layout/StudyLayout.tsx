import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Contextual navigation inside a study (docs §6). Covers the full multimodal
// lifecycle: protocol, hypotheses, conditions, modalities, synchronization,
// quality, analyses, datasets and models — not just overview/participants.

export function StudyLayout() {
  const { studyId } = useParams();
  const base = `/app/studies/${studyId}`;

  const navItems = [
    { name: "Visão geral", path: `${base}/overview` },
    { name: "Protocolo", path: `${base}/protocol` },
    { name: "Hipóteses", path: `${base}/hypotheses` },
    { name: "Condições", path: `${base}/conditions` },
    { name: "Variáveis", path: `${base}/variables` },
    { name: "Participantes", path: `${base}/participants` },
    { name: "Sessões", path: `${base}/sessions` },
    { name: "Sincronização", path: `${base}/sync` },
    { name: "Qualidade", path: `${base}/quality` },
    { name: "Análises", path: `${base}/analysis` },
    { name: "Datasets", path: `${base}/datasets` },
    { name: "Configurações", path: `${base}/settings` },
  ];

  return (
    <div className="min-h-full bg-slate-50/50">
      <div className="bg-white border-b border-slate-200 px-6 pt-5">
        {/* Breadcrumb — e.g. Projetos / Neuroergonomia 2026 / Estudo de fadiga */}
        <nav className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-3">
          <Link to="/app/projects" className="hover:text-slate-700">Projetos</Link>
          <ChevronRight size={12} />
          <Link to="/app/studies" className="hover:text-slate-700">Neuroergonomia 2026</Link>
          <ChevronRight size={12} />
          <span className="text-slate-700 font-medium">Estudo de fadiga</span>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Estudo de fadiga</h1>
        <p className="text-sm text-slate-500 mt-0.5">Desenho intraindivíduo · vídeo + EEG sincronizados · ID {studyId}</p>

        <nav className="mt-4 -mb-px flex gap-6 overflow-x-auto scrollbar-none">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "whitespace-nowrap border-b-2 pb-3 pt-1 text-[13px] font-medium transition-colors",
                  isActive
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                )
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
