import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { StudyWizard } from '@/features/studies/StudyWizard';

export function NewStudyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') ?? undefined;

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title="Novo estudo"
        description="Configure um estudo científico reutilizável. O fluxo não obriga um objetivo educacional — o desenho e as modalidades são definidos livremente."
      />
      <div className="px-6 pt-8">
        <StudyWizard
          projectId={projectId}
          onDone={() => navigate(projectId ? `/app/projects/${encodeURIComponent(projectId)}` : '/app/studies')}
        />
      </div>
    </div>
  );
}
