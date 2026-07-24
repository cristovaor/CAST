import { useState, useRef } from "react";
import { UploadCloud, FileVideo, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProxyVideoUpload } from "@/features/videos/useVideos";

type UploadState = 'idle' | 'selecting_file' | 'uploading' | 'upload_complete' | 'failed' | 'rejected';

interface VideoUploadCardProps {
  participantId?: string; // optional but required for actual upload
  sessionId?: string;     // when set, the video is attached to this session
  onUploadCompleted: (videoId: string, sessionId: string) => void;
  maxSizeBytes?: number; // default 500MB
}

export function VideoUploadCard({ participantId, sessionId, onUploadCompleted, maxSizeBytes = 500 * 1024 * 1024 }: VideoUploadCardProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: uploadVideo } = useProxyVideoUpload();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.type.startsWith('video/')) {
        setErrorMsg("Por favor, selecione um arquivo de vídeo válido.");
        setUploadState('rejected');
        return;
      }
      if (selected.size > maxSizeBytes) {
        setErrorMsg("O arquivo excede o limite de tamanho (500MB).");
        setUploadState('rejected');
        return;
      }
      setFile(selected);
      setUploadState('selecting_file');
      setErrorMsg(null);
    }
  };

  const executeUpload = async () => {
    if (!file) return;
    if (!participantId) {
      setErrorMsg("ID do participante não encontrado. Preencha a primeira etapa.");
      setUploadState('rejected');
      return;
    }

    setUploadState('uploading');
    setProgress(50); // Fake progress for proxy since fetch doesn't natively expose upload progress without XHR
    
    try {
      const result = await uploadVideo({ participant_id: participantId, session_id: sessionId, file });
      setProgress(100);
      setUploadState('upload_complete');
      onUploadCompleted(result.video_asset_id, result.session_id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro no upload via proxy");
      setUploadState('failed');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto border rounded-xl bg-card shadow-sm p-6">
      {uploadState === 'idle' || uploadState === 'rejected' || uploadState === 'failed' ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors hover:bg-muted/50",
            (uploadState === 'rejected' || uploadState === 'failed') ? "border-destructive/50 bg-destructive/10" : "border-border"
          )}
        >
          <UploadCloud className={cn("h-10 w-10 mx-auto mb-4", (uploadState === 'rejected' || uploadState === 'failed') ? "text-destructive" : "text-muted-foreground")} />
          <h3 className="font-medium">Clique para selecionar ou arraste o vídeo</h3>
          <p className="text-sm text-muted-foreground mt-1">MP4, WebM (Max 500MB)</p>
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            accept="video/*" 
            onChange={handleFileSelect}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileVideo className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file?.name}</p>
              <p className="text-xs text-muted-foreground">{(file!.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            {uploadState === 'selecting_file' && (
              <button onClick={() => setUploadState('idle')} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
            {uploadState === 'upload_complete' && (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
          </div>

          {(uploadState === 'uploading') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-primary">
                  Enviando (Proxy Backend)...
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-300", "bg-primary")}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {uploadState === 'selecting_file' && (
            <button 
              onClick={executeUpload}
              className="w-full inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Iniciar Upload
            </button>
          )}
        </div>
      )}

      {(uploadState === 'rejected' || uploadState === 'failed') && errorMsg && (
        <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
