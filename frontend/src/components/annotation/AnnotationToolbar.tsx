import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Eye, Activity, MessageSquare, UserCheck, Frown, XCircle, Save } from "lucide-react";

export type MicroActionType = 'OLHO_FECHADO' | 'OLHANDO_CANTO' | 'MEXEU_LABIOS' | 'VIROU_ROSTO' | 'MEXEU_SOBRANCELHA';

interface AnnotationToolbarProps {
  activeAction: MicroActionType | null;
  onSelectAction: (action: MicroActionType) => void;
  onSave: () => void;
  onCancel: () => void;
  isSelecting: boolean;
}

export function AnnotationToolbar({ activeAction, onSelectAction, onSave, onCancel, isSelecting }: AnnotationToolbarProps) {
  const ACTIONS: { type: MicroActionType; label: string; key: string; icon: React.ElementType; color: string }[] = [
    { type: 'OLHO_FECHADO', label: "Olho Fechado", key: "1", icon: Eye, color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" },
    { type: 'OLHANDO_CANTO', label: "Olhando de Canto", key: "2", icon: Activity, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
    { type: 'MEXEU_LABIOS', label: "Mexeu Lábios", key: "3", icon: MessageSquare, color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
    { type: 'VIROU_ROSTO', label: "Virou Rosto", key: "4", icon: UserCheck, color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
    { type: 'MEXEU_SOBRANCELHA', label: "Mexeu Sobrancelha", key: "5", icon: Frown, color: "text-pink-500 bg-pink-500/10 border-pink-500/20" },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("video_command", { detail: "playpause" }));
          break;
        case "ArrowLeft":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("video_command", { detail: "prev_frame" }));
          break;
        case "ArrowRight":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("video_command", { detail: "next_frame" }));
          break;
        case "1": onSelectAction('OLHO_FECHADO'); break;
        case "2": onSelectAction('OLHANDO_CANTO'); break;
        case "3": onSelectAction('MEXEU_LABIOS'); break;
        case "4": onSelectAction('VIROU_ROSTO'); break;
        case "5": onSelectAction('MEXEU_SOBRANCELHA'); break;
        case "Enter": 
          if (isSelecting) onSave();
          break;
        case "Escape":
          if (isSelecting) onCancel();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectAction, onSave, onCancel, isSelecting]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-2">Microação</h3>
      
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.type}
            onClick={() => onSelectAction(a.type)}
            className={cn(
              "flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-sm relative group",
              activeAction === a.type 
                ? `ring-2 ring-primary border-transparent ${a.color}` 
                : "hover:bg-muted"
            )}
          >
            <span className="absolute top-1 right-2 text-xs font-mono text-muted-foreground opacity-50 group-hover:opacity-100">
              [{a.key}]
            </span>
            <a.icon className="h-5 w-5 mb-2" />
            <span className="font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="pt-4 border-t flex items-center justify-between mt-2 gap-2">
        <div className="text-xs text-muted-foreground">
          {isSelecting ? "Anotação em andamento..." : "Selecione uma ação para começar."}
        </div>
        
        <div className="flex gap-2">
          <button 
            disabled={!isSelecting}
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <XCircle className="h-3 w-3 mr-1.5" />
            Esc
          </button>
          <button 
            disabled={!isSelecting}
            onClick={onSave}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save className="h-3 w-3 mr-1.5" />
            Enter
          </button>
        </div>
      </div>
    </div>
  );
}
