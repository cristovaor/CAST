import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { StudyWizard } from '@/features/studies/StudyWizard';

export function NewStudyPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-full bg-slate-50/50 pb-12">
      <PageHeader
        title="Novo estudo"
        description="Configure um estudo científico reutilizável. O fluxo não obriga um objetivo educacional — o desenho e as modalidades são definidos livremente."
      />
      <div className="px-6 pt-8">
        <StudyWizard onDone={() => navigate('/app/studies')} />
      </div>
    </div>
  );
}
