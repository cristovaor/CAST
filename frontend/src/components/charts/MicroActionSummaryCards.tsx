import { useTranslation } from "react-i18next";
import { Activity, Eye, MessageSquare, UserCheck, Frown } from "lucide-react";

export type MicroActionType = 'OLHO_FECHADO' | 'OLHANDO_CANTO' | 'MEXEU_LABIOS' | 'VIROU_ROSTO' | 'MEXEU_SOBRANCELHA';

export type SummaryData = Record<MicroActionType, { count: number; perMinute: number }>;

const ICONS: Record<MicroActionType, React.ReactNode> = {
  OLHO_FECHADO: <Eye className="h-5 w-5 text-indigo-500" />,
  OLHANDO_CANTO: <Activity className="h-5 w-5 text-emerald-500" />,
  MEXEU_LABIOS: <MessageSquare className="h-5 w-5 text-amber-500" />,
  VIROU_ROSTO: <UserCheck className="h-5 w-5 text-rose-500" />,
  MEXEU_SOBRANCELHA: <Frown className="h-5 w-5 text-pink-500" />
};

export function MicroActionSummaryCards({ summary }: { summary: SummaryData }) {
  const { t } = useTranslation("ui");
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Object.entries(summary).map(([key, data]) => {
        const type = key as MicroActionType;
        return (
          <div key={key} className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-muted-foreground">{t(`microActions.summary.${type}`)}</span>
              {ICONS[type]}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold">{data.count}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("microActions.perMinute", { value: data.perMinute.toFixed(1) })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
