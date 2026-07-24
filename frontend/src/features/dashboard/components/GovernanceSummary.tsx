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
  onOpen?: () => void;
}

export function GovernanceSummary({ data, onOpen }: GovernanceSummaryProps) {
  if (!data) return null;

  return (
    <div className="card bg-surface shadow-sm ring-1 ring-border/50 flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600" />
          <h2 className="text-[14px] font-semibold text-text-primary tracking-tight">Governança Operacional</h2>
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
              <div className="text-[12px] font-medium text-text-secondary">Modelo Ativo</div>
              <div className="text-[13px] font-semibold text-text-primary">{data.activeModel}</div>
            </div>
          </div>
          <div className="text-right">
              <div className="text-[11px] text-text-muted">Avaliação</div>
              <div className="text-[12px] font-medium text-text-secondary">{data.lastEvaluation}</div>
          </div>
        </div>

        {/* Consents */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FileCheck size={14} />
            </div>
            <div>
              <div className="text-[12px] font-medium text-text-secondary">Consentimentos</div>
              <div className="text-[13px] font-semibold text-text-primary">Válidos</div>
            </div>
          </div>
          <div className="text-right">
              <div className="text-[11px] text-text-muted">Taxa</div>
            <div className="text-[12px] font-semibold text-emerald-600">{data.validConsents}</div>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-surface-muted text-text-secondary flex items-center justify-center shrink-0">
              <FileText size={14} />
            </div>
            <div>
              <div className="text-[12px] font-medium text-text-secondary">Auditoria</div>
              <div className="text-[13px] font-semibold text-text-primary">Logs recentes</div>
            </div>
          </div>
          <div className="text-right">
              <div className="text-[11px] text-text-muted">Eventos</div>
              <div className="text-[12px] font-semibold text-text-secondary">{data.auditLogsCount.toLocaleString('pt-BR')}</div>
          </div>
        </div>

      </div>
      <div className="p-4 border-t border-border bg-surface-muted/50 rounded-b-xl">
        <ActionButton variant="secondary" size="sm" fullWidth onClick={onOpen}>
          Ver Relatório de Compliance
        </ActionButton>
      </div>
    </div>
  );
}
