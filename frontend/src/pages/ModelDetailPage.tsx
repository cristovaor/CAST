// removed React import
import { useParams, useNavigate } from 'react-router-dom';
import { useModelVersion, usePromoteModel } from '@/features/models/useModels';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft } from 'lucide-react';

export default function ModelDetailPage() {
  const { modelId, version, action } = useParams<{ modelId: string, version: string, action: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModelVersion(modelId!, version!, action!);
  const promoteMutation = usePromoteModel();

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!model) return <div className="p-8">Model not found</div>;

  const handlePromote = (status: string) => {
    promoteMutation.mutate({ versionId: model.id, targetStatus: status });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate('/app/models')} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Models
      </Button>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{model.model_id} v{model.version}</h1>
          <p className="text-muted-foreground">Action: {model.action}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge>{model.status}</Badge>
          {model.status === 'draft' && <Button onClick={() => handlePromote('candidate')}>Promote to Candidate</Button>}
          {model.status === 'candidate' && <Button onClick={() => handlePromote('active')}>Promote to Active</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Metrics</h2>
          <div className="space-y-2">
            <p>F1 Score: {model.metrics?.f1 || model.metrics?.f1_score}</p>
            <p>Accuracy: {model.metrics?.accuracy}</p>
            <p>Precision: {model.metrics?.precision}</p>
            <p>Recall: {model.metrics?.recall}</p>
            <p>Specificity: {model.metrics?.specificity}</p>
          </div>
        </Card>
        
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Manifest</h2>
          <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-64">
            {JSON.stringify(model.manifest, null, 2)}
          </pre>
        </Card>
      </div>
    </div>
  );
}
