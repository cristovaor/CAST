import { ShieldCheck, FileCheck, Brain, FileText } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';

interface GovernanceData {
  activeModel: string;
  lastEvaluation: string;
  validConsents: string;
  auditLogsCount: number;
}

interface GovernanceSummaryProps {
  data: GovernanceData;
}

export function GovernanceSummary({ data }: GovernanceSummaryProps) {
  if (!data) return null;

  return (
    <div className="card bg-white shadow-sm ring-1 ring-slate-200/50 flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600" />
          <h2 className="text-[14px] font-semibold text-slate-900 tracking-tight">Governança Operacional</h2>
        </div>
      </div>
      <div className="p-5 flex-1 flex flex-col justify-center gap-4">
        
        {/* Model */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Brain size={14} />
            </div>
            <div>
              <div className="text-[12px] font-medium text-slate-500">Modelo Ativo</div>
              <div className="text-[13px] font-semibold text-slate-800">{data.activeModel}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Avaliação</div>
            <div className="text-[12px] font-medium text-slate-600">{data.lastEvaluation}</div>
          </div>
        </div>

        {/* Consents */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FileCheck size={14} />
            </div>
            <div>
              <div className="text-[12px] font-medium text-slate-500">Consentimentos</div>
              <div className="text-[13px] font-semibold text-slate-800">Válidos</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Taxa</div>
            <div className="text-[12px] font-semibold text-emerald-600">{data.validConsents}</div>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <FileText size={14} />
            </div>
            <div>
              <div className="text-[12px] font-medium text-slate-500">Auditoria</div>
              <div className="text-[13px] font-semibold text-slate-800">Logs recentes</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Eventos</div>
            <div className="text-[12px] font-semibold text-slate-600">{data.auditLogsCount.toLocaleString('pt-BR')}</div>
          </div>
        </div>

      </div>
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
        <ActionButton variant="secondary" size="sm" fullWidth>
          Ver Relatório de Compliance
        </ActionButton>
      </div>
    </div>
  );
}
