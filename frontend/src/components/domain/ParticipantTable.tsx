import { CheckCircle2, Clock, XCircle } from "lucide-react";

export type ConsentStatus = 'pending' | 'accepted' | 'revoked';

export interface Participant {
  id: string;
  externalCode: string;
  group?: string;
  consentStatus: ConsentStatus;
  consentDate?: string;
}

interface ParticipantTableProps {
  participants: Participant[];
}

export function ParticipantTable({ participants }: ParticipantTableProps) {
  const getConsentIcon = (status: ConsentStatus) => {
    switch (status) {
      case 'accepted': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'revoked': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  const getConsentLabel = (status: ConsentStatus) => {
    switch (status) {
      case 'accepted': return 'Aceito';
      case 'revoked': return 'Revogado';
      default: return 'Pendente';
    }
  };

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/50 text-muted-foreground border-b">
          <tr>
            <th className="h-12 px-4 font-medium">Código Pseudonimizado</th>
            <th className="h-12 px-4 font-medium">Grupo Experimental</th>
            <th className="h-12 px-4 font-medium">Status do Consentimento</th>
            <th className="h-12 px-4 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {participants.length === 0 ? (
            <tr>
              <td colSpan={4} className="h-24 text-center text-muted-foreground">
                Nenhum participante cadastrado.
              </td>
            </tr>
          ) : (
            participants.map((p) => (
              <tr key={p.id} className="border-b transition-colors hover:bg-muted/50">
                <td className="p-4 font-medium">{p.externalCode}</td>
                <td className="p-4">{p.group || '-'}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    {getConsentIcon(p.consentStatus)}
                    <span>{getConsentLabel(p.consentStatus)}</span>
                    {p.consentDate && <span className="text-xs text-muted-foreground">({p.consentDate})</span>}
                  </div>
                </td>
                <td className="p-4 text-right">
                  <button className="text-primary hover:underline font-medium text-sm">
                    Editar
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
