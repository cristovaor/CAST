import { ShieldCheck, Lock, FileCheck2, Trash2, UserCheck, History, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { useAuditLog, useGovernanceSummary } from '@/features/multimodal/useMultimodal';

// Governance, ethics & privacy for sensitive data (docs §21). Video + EEG are
// sensitive personal data; the platform embeds pseudonymization, consent,
// purpose limitation, retention, access control, audit and re-identification
// risk warnings from the start.

const CONTROLS = [
  { icon: UserCheck, title: 'Pseudonimização', desc: 'Participantes identificados apenas por código; identidade nunca exibida.', status: 'Ativa', tone: 'success' as const },
  { icon: FileCheck2, title: 'Consentimento & finalidade', desc: 'Uso restrito à finalidade consentida por estudo; reutilização exige nova base.', status: '2 pendências', tone: 'warning' as const },
  { icon: Lock, title: 'Controle de acesso', desc: 'Segregação por estudo; acesso justificado e registrado.', status: 'Ativo', tone: 'success' as const },
  { icon: History, title: 'Retenção & descarte', desc: 'Política por estudo; anonimização e descarte programados.', status: 'Configurada', tone: 'info' as const },
];

const ALERTS = [
  { level: 'danger' as const, text: 'Tentativa de análise em sessão com consentimento revogado (S-0031) foi bloqueada.' },
  { level: 'warning' as const, text: 'Exportação de dataset ds2 inclui EEG identificável — revisar risco de reidentificação antes de compartilhar.' },
  { level: 'warning' as const, text: 'Participante P-0192 aparece em dois estudos — verificar segregação e base legal.' },
];

const AUDIT = [
  { at: '2026-07-20 08:12', who: 'pesq.principal', action: 'Exportou dataset v1.2.0 (manifesto anexado)' },
  { at: '2026-07-19 16:40', who: 'cientista.dados', action: 'Acessou vídeo bruto S-0048 — justificativa: revisão de qualidade' },
  { at: '2026-07-19 09:05', who: 'admin', action: 'Concedeu acesso "annotator" ao Estudo de fadiga' },
  { at: '2026-07-18 14:22', who: 'participante P-0207', action: 'Revogou consentimento — dados marcados para descarte' },
];

const ALERT_TONE = { danger: 'text-red-600 bg-red-50 border-red-200', warning: 'text-amber-700 bg-amber-50 border-amber-200' };

const AUDIT_ACTION_LABEL: Record<string, string> = {
  access: 'Acesso', export: 'Exportação', consent_change: 'Alteração de consentimento',
  grant: 'Concessão de acesso', delete: 'Descarte', sync_decision: 'Decisão de sincronização',
  dataset_freeze: 'Congelamento de dataset',
};

export function GovernancePage() {
  // Prefer live audit/summary; fall back to illustrative rows when offline.
  const { data: liveAudit } = useAuditLog();
  const { data: summary } = useGovernanceSummary();

  const auditRows = (liveAudit && liveAudit.length)
    ? liveAudit.map((a) => ({
        at: a.created_at.slice(0, 16).replace('T', ' '),
        who: a.actor_label ?? '—',
        action: `${AUDIT_ACTION_LABEL[a.action] ?? a.action}${a.entity_type ? ` · ${a.entity_type}` : ''}${a.justification ? ` — ${a.justification}` : ''}`,
      }))
    : AUDIT;

  const consentStatus: { tone: 'success' | 'warning'; label: string } =
    summary && summary.pending_consents > 0
      ? { tone: 'warning', label: `${summary.pending_consents} pendência(s)` }
      : { tone: 'success', label: 'Ativos' };

  return (
    <div className="min-h-full bg-slate-50/50 pb-12">
      <PageHeader
        title="Governança, ética & privacidade"
        description="Vídeo facial e EEG são dados pessoais sensíveis. O acesso é segregado por estudo, registrado e limitado à finalidade consentida."
        actions={<ToneBadge tone="success"><ShieldCheck size={12} /> Conforme</ToneBadge>}
      />

      <div className="px-6 pt-6 space-y-6">
        <ScientificCaveat variant="privacy" />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CONTROLS.map((c) => {
            // Consent card reflects the live governance summary when available.
            const isConsent = c.title.startsWith('Consentimento');
            const tone = isConsent ? consentStatus.tone : c.tone;
            const statusLabel = isConsent ? consentStatus.label : c.status;
            return (
            <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><c.icon size={16} /></div>
                <ToneBadge tone={tone}>{statusLabel}</ToneBadge>
              </div>
              <h3 className="text-sm font-semibold text-slate-800">{c.title}</h3>
              <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{c.desc}</p>
            </div>
            );
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800">Alertas de proteção</h3>
            </div>
            <ul className="space-y-2">
              {ALERTS.map((a, i) => (
                <li key={i} className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${ALERT_TONE[a.level]}`}>{a.text}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">O sistema alerta ou impede: análise sem consentimento válido, reutilização fora da finalidade, mistura de participantes entre estudos, compartilhamento de vídeo bruto ou EEG identificável, e uso clínico não autorizado.</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <History size={16} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">Trilha de auditoria</h3>
            </div>
            <ol className="space-y-3">
              {auditRows.map((a, i) => (
                <li key={i} className="relative pl-4 text-[12px]">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <p className="text-slate-700">{a.action}</p>
                  <p className="text-[11px] text-slate-400">{a.who} · {a.at}</p>
                </li>
              ))}
            </ol>
            <button className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-700">
              <Trash2 size={13} /> Ver solicitações de descarte
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
