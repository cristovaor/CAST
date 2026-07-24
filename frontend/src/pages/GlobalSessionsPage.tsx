import { Users, Plus, AlertCircle, Video, Activity } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useSessions } from '@/features/sessions/useSessions';

export function GlobalSessionsPage() {
  const { data: sessions, isLoading, isError } = useSessions();

  return (
    <div className="min-h-full">
      <PageHeader
        title="Sessões de Coleta"
        description="Visão geral de todas as sessões experimentais registradas na instituição."
        actions={
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={16} />
            Nova Sessão
          </button>
        }
      />
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : isError ? (
          <EmptyState
            variant="error"
            title="Erro ao carregar"
            description="Não foi possível carregar a lista de sessões."
            icon={<AlertCircle size={40} className="text-red-400" />}
          />
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhuma sessão cadastrada"
            description="Comece registrando uma nova sessão vinculada a um estudo ativo."
            icon={<Users size={40} className="text-slate-300" />}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Sessão ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estudo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Participante</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Data de Criação</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Assets</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {session.id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {session.study_id.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {session.participant_id.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {new Date(session.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        {session.video_asset_id ? (
                          <span title="Possui Vídeo" className="text-blue-500"><Video size={18} /></span>
                        ) : (
                          <span title="Sem Vídeo" className="text-slate-300"><Video size={18} /></span>
                        )}
                        {session.eeg_asset_id ? (
                          <span title="Possui EEG" className="text-purple-500"><Activity size={18} /></span>
                        ) : (
                          <span title="Sem EEG" className="text-slate-300"><Activity size={18} /></span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
