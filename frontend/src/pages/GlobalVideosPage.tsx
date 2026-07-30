import { useMemo, useState } from 'react';
import { AlertCircle, UploadCloud, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { UploadAssetDialog } from '@/features/acquisition/UploadAssetDialog';
import { useStudies } from '@/features/studies/useStudies';
import { useGlobalVideos } from '@/features/videos/useVideos';

export function GlobalVideosPage() {
  const navigate = useNavigate();
  const { data: videos, isLoading, isError } = useGlobalVideos();
  const { data: studies = [] } = useStudies();
  const [search, setSearch] = useState('');
  const [studyId, setStudyId] = useState('');
  const [status, setStatus] = useState('');

  const studyNames = useMemo(
    () => new Map(studies.map((study) => [study.id, study.name])),
    [studies],
  );
  const statuses = useMemo(
    () => [...new Set((videos ?? []).map((video) => video.status).filter(Boolean))].sort(),
    [videos],
  );
  const filteredVideos = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (videos ?? []).filter((video) => {
      const matchesSearch = !term || [
        video.id,
        video.filename,
        video.participant_id,
        video.session_id,
        studyNames.get(video.study_id),
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
      return matchesSearch && (!studyId || video.study_id === studyId) && (!status || video.status === status);
    });
  }, [search, status, studyId, studyNames, videos]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Biblioteca de Vídeos"
        description="Repositório central de todas as mídias coletadas nos estudos."
        actions={
          <UploadAssetDialog kind="video">
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <UploadCloud size={16} />
              Fazer upload
            </button>
          </UploadAssetDialog>
        }
      />

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : isError ? (
          <EmptyState
            variant="error"
            title="Erro ao carregar"
            description="Não foi possível carregar a biblioteca de vídeos."
            icon={<AlertCircle size={40} className="text-red-400" />}
          />
        ) : !videos || videos.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Acervo vazio"
            description="Faça upload de vídeos ou conecte o armazenamento S3/MinIO para visualizar a biblioteca."
            icon={<Video size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por arquivo, vídeo, sessão ou participante..."
              resultCount={filteredVideos.length}
              totalCount={videos.length}
              resultLabel="vídeo"
              resultLabelPlural="vídeos"
              filters={[
                {
                  id: 'study',
                  label: 'Filtrar por estudo',
                  value: studyId,
                  onChange: setStudyId,
                  options: [
                    { value: '', label: 'Todos os estudos' },
                    ...studies.map((study) => ({ value: study.id, label: study.name })),
                  ],
                },
                {
                  id: 'status',
                  label: 'Filtrar por status',
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: '', label: 'Todos os status' },
                    ...statuses.map((value) => ({ value, label: value })),
                  ],
                },
              ]}
            />

            {filteredVideos.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhum vídeo corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outros vídeos."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">ID do vídeo</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Arquivo</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Estudo</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Participante</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Status</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredVideos.map((video) => (
                      <tr
                        key={video.id}
                        tabIndex={0}
                        onClick={() => navigate(`/app/videos/${video.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigate(`/app/videos/${video.id}`);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-text-primary">
                          {video.id.substring(0, 8)}...
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          <div className="flex items-center gap-2">
                            <Video size={16} className="text-text-muted" />
                            {video.filename}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {studyNames.get(video.study_id) ?? video.study_id.substring(0, 8)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {video.participant_id.substring(0, 8)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            video.status === 'processed'
                              ? 'bg-green-100 text-green-800'
                              : video.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {video.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {new Date(video.created_at).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
