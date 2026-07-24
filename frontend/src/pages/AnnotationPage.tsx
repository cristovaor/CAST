import { useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { VideoAnnotatorPlayer } from '@/features/annotations/components/VideoAnnotatorPlayer';
import { AnnotationTimeline } from '@/features/annotations/components/AnnotationTimeline';
import { AnnotationSidebarList } from '@/features/annotations/components/AnnotationSidebarList';
import { AnnotationToolbar } from '@/features/annotations/components/AnnotationToolbar';
import { useAnnotationStore } from '@/features/annotations/store/useAnnotationStore';
import { useVideoDetails, useVideoPlaybackUrl } from '@/features/videos/useVideos';

// Mock categories mapped to keys 1-9
const CATEGORY_MAP: Record<string, string> = {
  '1': 'Olho Fechado',
  '2': 'Boca Aberta',
  '3': 'Olhando para o lado',
  '4': 'Inclinado',
  '5': 'Movimento Brusco',
};

export function AnnotationPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { data: videoDetails } = useVideoDetails(videoId!);
  const { data: playback } = useVideoPlaybackUrl(videoId!);
  const fps = Number(videoDetails?.fps) || 30;
  const frameStep = 1 / fps;
  const {
    isPlaying, 
    setIsPlaying, 
    currentTime, 
    setCurrentTime,
    duration,
    draft,
    startDraft,
    finishDraft,
    cancelDraft
  } = useAnnotationStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore keypresses inside inputs
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        setIsPlaying(!isPlaying);
        break;
      
      case 'ArrowLeft':
        e.preventDefault();
        setCurrentTime(Math.max(0, currentTime - frameStep));
        break;

      case 'ArrowRight':
        e.preventDefault();
        setCurrentTime(Math.min(duration, currentTime + frameStep));
        break;

      case 'Enter':
        e.preventDefault();
        if (draft) {
          // Finish annotation draft
          finishDraft(currentTime, Math.floor(currentTime * fps), videoId || 'mock-video-id', 'current-user-id');
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        if (draft) {
          cancelDraft();
        }
        break;
      
      default:
        // Handle numbers 1-9
        if (e.key >= '1' && e.key <= '9') {
          e.preventDefault();
          const actionType = CATEGORY_MAP[e.key];
          if (actionType && !draft) {
            startDraft(actionType, currentTime, Math.floor(currentTime * fps));
          }
        }
        break;
    }
  }, [isPlaying, currentTime, duration, draft, startDraft, finishDraft, cancelDraft, setIsPlaying, setCurrentTime, videoId, fps, frameStep]);

  const { fetchEvents } = useAnnotationStore();

  useEffect(() => {
    if (videoId) {
      fetchEvents(videoId);
    }
  }, [videoId, fetchEvents]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Real playback URL from storage; falls back to a sample for local dev.
  const mockVideoUrl = playback?.url || "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col focus:outline-none" tabIndex={-1}>
      <PageHeader
        title="Anotação de Vídeo"
        description="Ferramenta de anotação manual e revisão das inferências do modelo."
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
          
          {/* Video Player Section */}
          <div className="flex-1 p-4 flex flex-col justify-center items-center relative z-10">
            <VideoAnnotatorPlayer videoUrl={mockVideoUrl} />
          </div>

          {/* Toolbar */}
          <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 shrink-0 z-20">
            <AnnotationToolbar />
          </div>

          {/* Timeline */}
          <div className="shrink-0 z-20">
            <AnnotationTimeline />
          </div>
        </div>

        {/* Sidebar */}
        <div className="z-20">
          <AnnotationSidebarList />
        </div>
      </div>
    </div>
  );
}
