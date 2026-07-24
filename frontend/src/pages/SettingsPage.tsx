import { Settings } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn } from '@/lib/utils';

const SETTING_TABS = [
  { key: 'general',       label: 'Geral' },
  { key: 'organization',  label: 'Organização' },
  { key: 'users',         label: 'Usuários' },
  { key: 'pipeline',      label: 'Pipeline' },
  { key: 'integrations',  label: 'Integrações' },
];

export function SettingsPage() {
  const [tab, setTab] = useState('general');

  return (
    <div className="min-h-full">
      <PageHeader
        title="Configurações"
        description="Gerencie preferências, organização, usuários e configurações do pipeline."
        tabs={
          <div className="flex items-center gap-0.5">
            {SETTING_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                  tab === t.key
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="p-6">
        <EmptyState
          variant="empty"
          title={`${SETTING_TABS.find((t) => t.key === tab)?.label} — Em desenvolvimento`}
          description="As configurações da plataforma CAST Pro estarão disponíveis em breve."
          icon={<Settings size={40} className="text-slate-300" />}
        />
      </div>
    </div>
  );
}
