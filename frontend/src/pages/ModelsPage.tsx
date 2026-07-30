import { Eye, Sparkles, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { ModelVersionBadge } from '@/components/ui/ModelVersionBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RegisterModelDialog } from '@/features/models/RegisterModelDialog';
import { TrainModelDialog } from '@/features/models/TrainModelDialog';
import { useModelVersions } from '@/features/models/useModels';
import type { ModelVersion, StatusVariant } from '@/types/domain';

export function ModelsPage() {
  const { data: models = [], isLoading } = useModelVersions();
  const navigate = useNavigate();

  const MODEL_COLUMNS: ColumnDef<ModelVersion>[] = [
    {
      key: 'model_id',
      header: 'Modelo',
      sortable: true,
      render: (_, row) => <ModelVersionBadge name={row.model_id} version={row.version} active={row.status === 'active'} />,
    },
    {
      key: 'action',
      header: 'Ação',
      render: (v) => <span className="text-xs font-semibold bg-surface-muted px-2 py-1 rounded text-text-secondary">{String(v)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => <StatusBadge status={String(v) as StatusVariant} />,
    },
    {
      key: 'metrics',
      header: 'F1 Score',
      render: (_, row) => {
        const f1 = row.metrics?.f1_score || row.metrics?.f1;
        return <span className="font-mono text-xs text-text-secondary">{f1 ? Number(f1).toFixed(3) : '—'}</span>;
      },
    },
    {
      key: 'created_at',
      header: 'Registrado em',
      render: (v) => <span className="text-xs text-text-muted">{new Date(String(v)).toLocaleDateString()}</span>,
    },
    {
      key: 'id',
      header: '',
      render: (_, row) => (
        <button
          onClick={() => navigate(`/app/models/${row.model_id}/${row.version}/${row.action}`)}
          className="p-1 text-text-muted hover:text-blue-600 transition-colors"
        >
          <Eye size={16} />
        </button>
      )
    }
  ];

  return (
    <div className="min-h-full">
      <PageHeader
        title="Modelos de microação"
        description="Registro e versionamento de modelos de inferência utilizados no pipeline de análise."
        actions={
          <>
            <RegisterModelDialog>
              <button
                title="Importar um artefato .keras já treinado fora do sistema"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-app-bg transition-colors"
              >
                <UploadCloud size={14} />
                Registrar artefato existente
              </button>
            </RegisterModelDialog>
            <TrainModelDialog>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">
                <Sparkles size={14} />
                Treinar novo modelo
              </button>
            </TrainModelDialog>
          </>
        }
      />
      <div className="p-6">
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <div className="w-8 h-8 rounded-full border-4 border-border border-t-blue-600 animate-spin" />
            </div>
          ) : (
            <DataTable columns={MODEL_COLUMNS} data={models} />
          )}
        </div>
      </div>
    </div>
  );
}
