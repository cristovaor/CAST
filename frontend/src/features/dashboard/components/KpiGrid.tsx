import { MetricCard } from '@/components/data-display/MetricCard';
import type { KPICardData } from '@/types/domain';

interface KpiGridProps {
  kpis: KPICardData[];
}

export function KpiGrid({ kpis }: KpiGridProps) {
  if (!kpis || kpis.length === 0) return null;

  // Destaca o primeiro KPI como Hero
  const [heroKpi, ...secondaryKpis] = kpis;

  return (
    <section aria-label="Indicadores principais" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {/* Hero KPI occupies more space on large screens */}
        <div className="lg:col-span-4 xl:col-span-2 flex">
          <MetricCard data={heroKpi} variant="hero" className="flex-1" />
        </div>
        
        {/* Secondary KPIs fill the rest of the grid */}
        <div className="grid grid-cols-2 lg:col-span-4 xl:col-span-4 gap-4 xl:grid-cols-5">
          {secondaryKpis.map((kpi) => (
            <MetricCard key={kpi.id} data={kpi} className="flex-1" />
          ))}
        </div>
      </div>
    </section>
  );
}
