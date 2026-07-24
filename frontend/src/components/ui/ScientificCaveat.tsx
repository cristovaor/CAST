import { Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

// Reusable, non-deterministic language banner.
// Communicates the platform's core scientific principle (docs §4):
// associations are not causes; results require researcher validation.

type Variant = 'association' | 'privacy' | 'model' | 'quality';

const VARIANTS: Record<Variant, { icon: typeof Info; title: string; body: string; cls: string }> = {
  association: {
    icon: Info,
    title: 'Interpretação científica',
    body:
      'Coincidências temporais entre vídeo e EEG indicam associação, não causalidade. Os resultados dependem do protocolo e dos parâmetros selecionados e requerem validação pelo pesquisador.',
    cls: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  privacy: {
    icon: ShieldAlert,
    title: 'Dados sensíveis',
    body:
      'Vídeo facial e EEG são dados pessoais sensíveis. O acesso é registrado, restrito à finalidade consentida e sujeito à política de retenção do estudo.',
    cls: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  model: {
    icon: Info,
    title: 'Estimativa de modelo',
    body:
      'As saídas do modelo são probabilidades atribuídas a eventos, não diagnósticos. Dependem do dataset de treinamento, do dispositivo e do protocolo, e podem não generalizar para outras populações.',
    cls: 'bg-violet-50 border-violet-200 text-violet-800',
  },
  quality: {
    icon: Info,
    title: 'Qualidade dos dados',
    body:
      'A qualidade de vídeo e EEG é avaliada de forma independente. Um único score não substitui a inspeção por canal, segmento e critério explícito.',
    cls: 'bg-slate-50 border-slate-200 text-slate-700',
  },
};

interface ScientificCaveatProps {
  variant?: Variant;
  children?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function ScientificCaveat({ variant = 'association', children, className, compact }: ScientificCaveatProps) {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <div
      role="note"
      className={cn('flex gap-3 rounded-lg border px-3.5 py-3', v.cls, compact && 'py-2', className)}
    >
      <Icon size={16} className="shrink-0 mt-0.5 opacity-80" />
      <div className="min-w-0">
        {!compact && <p className="text-[12px] font-semibold leading-tight">{v.title}</p>}
        <p className={cn('text-[12px] leading-relaxed', !compact && 'mt-0.5 opacity-90')}>
          {children ?? v.body}
        </p>
      </div>
    </div>
  );
}
