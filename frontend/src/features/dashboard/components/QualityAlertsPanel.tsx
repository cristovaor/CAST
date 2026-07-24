import { AlertTriangle, AlertCircle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface QualityAlert {
  id: string;
  title: string;
  description: string;
  type: 'warning' | 'error' | 'info';
}

interface QualityAlertsPanelProps {
  alerts: QualityAlert[];
}

export function QualityAlertsPanel({ alerts }: QualityAlertsPanelProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="card bg-white shadow-sm ring-1 ring-slate-200/50 flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <ShieldAlert size={16} className="text-slate-700" />
        <h2 className="text-[14px] font-semibold text-slate-900 tracking-tight">Alertas de Qualidade</h2>
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto">
        {alerts.map(alert => (
          <AlertItem key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}

function AlertItem({ alert }: { alert: QualityAlert }) {
  const isError = alert.type === 'error';
  const isWarning = alert.type === 'warning';
  
  const Icon = isError ? AlertCircle : (isWarning ? AlertTriangle : Info);
  
  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border transition-colors',
      isError ? 'bg-red-50/50 border-red-100/50 hover:bg-red-50' : 
      isWarning ? 'bg-amber-50/50 border-amber-100/50 hover:bg-amber-50' : 
      'bg-blue-50/50 border-blue-100/50 hover:bg-blue-50'
    )}>
      <div className={cn(
        'mt-0.5 shrink-0',
        isError ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-blue-500'
      )}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={cn(
          'text-[13px] font-semibold leading-tight mb-0.5',
          isError ? 'text-red-900' : isWarning ? 'text-amber-900' : 'text-blue-900'
        )}>
          {alert.title}
        </h3>
        <p className={cn(
          'text-[12px] leading-snug',
          isError ? 'text-red-700/80' : isWarning ? 'text-amber-700/80' : 'text-blue-700/80'
        )}>
          {alert.description}
        </p>
      </div>
    </div>
  );
}
