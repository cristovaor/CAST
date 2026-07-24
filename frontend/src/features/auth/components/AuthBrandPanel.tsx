import { ShieldCheck, Activity, BrainCircuit } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function AuthBrandPanel() {
  return (
    <div className="relative hidden h-full flex-col bg-slate-900 p-10 text-white lg:flex justify-between overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,theme(colors.blue.800/40%),transparent_50%)]" />
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxjaXJjbGUgY3g9IjEiIGN5PSIxIiByPSIxIiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20" />

      <div className="relative z-20 flex items-center gap-2 font-bold text-2xl tracking-tight">
        <BrainCircuit className="h-8 w-8 text-blue-500" />
        CAST Pro
      </div>

      <div className="relative z-20 mt-auto mb-10 space-y-6 max-w-md">
        <div className="space-y-2">
          <p className="text-sm font-medium tracking-wider text-blue-400 uppercase">
            Cognitive Action & Study Tracking
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Análise científica de microações em estudos cognitivos.
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed mt-4">
            Organize projetos, processe vídeos faciais, revise anotações humanas e acompanhe a qualidade dos dados em um único ambiente seguro.
          </p>
        </div>

        <ul className="space-y-4 text-sm text-slate-300 mt-8">
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
              <Activity className="h-4 w-4" />
            </div>
            Pipeline de análise com rastreabilidade
          </li>
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            Governança de dados sensíveis e auditoria
          </li>
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
              <BrainCircuit className="h-4 w-4" />
            </div>
            Métricas de qualidade para vídeos e modelos
          </li>
        </ul>
      </div>

      <div className="relative z-20 flex flex-wrap gap-3 mt-10">
        <Badge variant="secondary" className="bg-slate-800/80 text-slate-300 hover:bg-slate-800 border-slate-700">
          LGPD-ready
        </Badge>
        <Badge variant="secondary" className="bg-slate-800/80 text-slate-300 hover:bg-slate-800 border-slate-700">
          Audit Trail
        </Badge>
        <Badge variant="secondary" className="bg-slate-800/80 text-slate-300 hover:bg-slate-800 border-slate-700">
          Model Registry
        </Badge>
        <Badge variant="secondary" className="bg-slate-800/80 text-slate-300 hover:bg-slate-800 border-slate-700">
          Research-grade
        </Badge>
      </div>
    </div>
  );
}
