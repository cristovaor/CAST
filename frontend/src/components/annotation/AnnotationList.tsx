import { Trash2 } from "lucide-react";
import type { MicroActionType } from "./AnnotationToolbar";

export interface Annotation {
  id: string;
  type: MicroActionType;
  startFrame: number;
  endFrame: number;
}

interface AnnotationListProps {
  annotations: Annotation[];
  onDelete: (id: string) => void;
  onSeek: (frame: number) => void;
}

const ACTION_LABELS: Record<MicroActionType, string> = {
  OLHO_FECHADO: "Olho Fechado",
  OLHANDO_CANTO: "Olhando Canto",
  MEXEU_LABIOS: "Mexeu Lábios",
  VIROU_ROSTO: "Virou Rosto"
};

export function AnnotationList({ annotations, onDelete, onSeek }: AnnotationListProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm flex flex-col h-[400px]">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center justify-between">
          <span>Anotações Salvas</span>
          <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
            {annotations.length}
          </span>
        </h3>
      </div>
      
      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {annotations.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-4 text-center">
            Nenhuma anotação feita neste vídeo.
          </div>
        ) : (
          annotations.map((ann) => (
            <div 
              key={ann.id} 
              className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors group cursor-pointer"
              onClick={() => onSeek(ann.startFrame)}
            >
              <div>
                <div className="text-sm font-medium">{ACTION_LABELS[ann.type]}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  f: {ann.startFrame} ➝ {ann.endFrame}
                </div>
              </div>
              
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                title="Deletar anotação"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
