import { Link } from 'react-router-dom';
import { Video, Activity, Waypoints, Flag, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';

// Data acquisition hub (docs §6, §9–10): equivalent entry points for the two
// core modalities plus events, with pending validations surfaced.

const PENDING = [
  { id: 'S-0048', modality: 'video' as const, label: 'Vídeo aguardando validação', tone: 'warning' as const, to: '/app/videos/v-0048' },
  { id: 'S-0048', modality: 'eeg' as const, label: 'EEG requer revisão (F8 plano)', tone: 'warning' as const, to: '/app/sessions/0048/eeg' },
  { id: 'S-0049', modality: 'sync' as const, label: 'Sincronização pendente', tone: 'info' as const, to: '/app/sessions/0049/sync' },
];

const ICON = { video: Video, eeg: Activity, sync: Waypoints, events: Flag };

export function AcquisitionPage() {
  return (
    <div className="min-h-full bg-slate-50/50 pb-12">
      <PageHeader
        title="Aquisição de dados"
        description="Importação e validação de vídeo, EEG e eventos experimentais. As duas modalidades centrais recebem tratamento equivalente."
      />
      <div className="px-6 pt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <EntryCard icon={Video} title="Importar vídeo" desc="Formato, codec, fps, face, frames válidos." tone="blue" />
          <EntryCard icon={Activity} title="Importar EEG" desc="Canais, montagem, taxa, impedância, artefatos." tone="cyan" />
          <EntryCard icon={Flag} title="Importar eventos" desc="Triggers, marcadores e estímulos." tone="amber" />
          <EntryCard icon={Waypoints} title="Sincronizar" desc="Alinhar fontes no eixo temporal." tone="violet" />
        </div>

        <ScientificCaveat variant="quality" compact />

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Validações pendentes</h3>
          </div>
          <ul>
            {PENDING.map((p, i) => {
              const Icon = ICON[p.modality];
              return (
                <li key={i}>
                  <Link to={p.to} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <Icon size={16} className="text-slate-400" />
                    <span className="text-sm text-slate-700 font-medium">{p.id}</span>
                    <span className="text-[13px] text-slate-500">{p.label}</span>
                    <ToneBadge tone={p.tone} className="ml-auto">{p.tone === 'warning' ? 'Requer ação' : 'Pendente'}</ToneBadge>
                    <ArrowRight size={14} className="text-slate-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function EntryCard({ icon: Icon, title, desc, tone }: { icon: typeof Video; title: string; desc: string; tone: string }) {
  const c: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', cyan: 'bg-cyan-50 text-cyan-600',
    amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 transition-colors cursor-pointer">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${c[tone]}`}><Icon size={18} /></div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
    </div>
  );
}
