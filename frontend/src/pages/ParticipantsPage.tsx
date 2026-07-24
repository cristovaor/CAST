import { Users, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useParticipants } from '@/features/participants/useParticipants';

export function ParticipantsPage() {
  const { data: participantsData, isLoading } = useParticipants();
  const participants = participantsData?.items || [];

  return (
    <div className="min-h-full">
      <PageHeader
        title="Participantes"
        description="Gerenciamento de participantes, metadados e consentimentos (LGPD)."
        actions={
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={16} />
            Cadastrar
          </button>
        }
      />
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
          </div>
        ) : participants.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhum participante encontrado"
            description="Cadastre participantes para associá-los a sessões e vídeos."
            icon={<Users size={40} className="text-slate-300" />}
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <tr>
                  <th className="px-6 py-3">Código</th>
                  <th className="px-6 py-3">Grupo Demográfico</th>
                  <th className="px-6 py-3">Consentimento</th>
                  <th className="px-6 py-3">Data de Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {participants.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800">{p.external_code}</td>
                    <td className="px-6 py-4">{p.demographic_group ? JSON.stringify(p.demographic_group) : '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.consent_status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : p.consent_status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {p.consent_status === 'accepted' ? 'Aceito' : p.consent_status === 'pending' ? 'Pendente' : 'Revogado'}
                      </span>
                    </td>
                    <td className="px-6 py-4">{new Date(p.created_at).toLocaleDateString()}</td>
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
