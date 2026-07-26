import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AnnotationEvent,
  AnnotationIntervalAnalysis,
  AnnotationSuggestion,
} from '@/types/annotation';
import { AnnotationComparisonPanel } from './AnnotationComparisonPanel';
import { SmartIntervalProposal } from './SmartIntervalProposal';

const humanEvent: AnnotationEvent = {
  id: 'human-1',
  videoId: 'video-1',
  taskId: 'task-1',
  kind: 'interval',
  source: 'manual',
  actionCode: 'OF',
  actionLabel: 'Olhos fechados',
  microActionType: 'OF',
  startTime: 1,
  endTime: 2,
  startFrame: 30,
  endFrame: 60,
  confidence: null,
  annotatorId: 'user-1',
  region: 'eyes',
  side: 'both',
  spatialMetadata: {},
  revision: 1,
  createdAt: '2026-07-26T00:00:00',
  updatedAt: '2026-07-26T00:00:00',
};

function suggestion(
  actionCode = 'OF',
  startFrame = 32,
  endFrame = 58,
): AnnotationSuggestion {
  return {
    modelEventKey: 'model-1',
    actionCode,
    startFrame,
    endFrame,
    startTime: startFrame / 30,
    endTime: endFrame / 30,
    confidence: 0.9,
    modelVersion: 'test',
    review: null,
  };
}

describe('AnnotationComparisonPanel', () => {
  it('identifies a matching human and model interval', () => {
    render(
      <AnnotationComparisonPanel
        events={[humanEvent]}
        suggestions={[suggestion()]}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.getByText('concordantes').parentElement).toHaveTextContent(
      '1concordantes',
    );
    expect(screen.getByText('divergências').parentElement).toHaveTextContent(
      '0divergências',
    );
  });

  it('exposes a conflicting interval as a seek target', () => {
    const onSeek = vi.fn();
    render(
      <AnnotationComparisonPanel
        events={[humanEvent]}
        suggestions={[suggestion('ML')]}
        onSeek={onSeek}
      />,
    );

    fireEvent.click(screen.getByText('OF × ML'));
    expect(onSeek).toHaveBeenCalledWith(1000);
  });
});

describe('SmartIntervalProposal', () => {
  it('applies the landmark-derived boundaries and shows quality warnings', () => {
    const onApply = vi.fn();
    const analysis: AnnotationIntervalAnalysis = {
      available: true,
      originalStartFrame: 30,
      originalEndFrame: 60,
      suggestedStartFrame: 28,
      suggestedEndFrame: 63,
      boundaryConfidence: 0.82,
      motionSeries: [
        { frameIndex: 28, motion: 0.02 },
        { frameIndex: 63, motion: 0.03 },
      ],
      quality: {
        faceDetectionRate: 0.8,
        pointCoverage: 0.95,
        unstableTracking: false,
        warnings: [
          {
            code: 'face_missing',
            severity: 'warning',
            message: 'Face ausente em parte do intervalo.',
          },
        ],
      },
    };

    render(
      <SmartIntervalProposal
        analysis={analysis}
        onApply={onApply}
        onKeepOriginal={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Face ausente em parte do intervalo.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Aplicar ajuste'));
    expect(onApply).toHaveBeenCalledWith(28, 63);
  });
});
