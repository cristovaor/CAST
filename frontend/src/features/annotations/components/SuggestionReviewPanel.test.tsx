import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuggestionReviewPanel } from './SuggestionReviewPanel';

describe('SuggestionReviewPanel', () => {
  it('sends the stable suggestion when accepted', () => {
    const onReview = vi.fn();
    const suggestion = {
      modelEventKey: 'stable-key',
      actionCode: 'OF',
      startFrame: 10,
      endFrame: 20,
      startTime: 1,
      endTime: 2,
      confidence: 0.91,
      modelVersion: 'v1',
      review: null,
    };
    render(
      <SuggestionReviewPanel
        suggestions={[suggestion]}
        predictionId="prediction"
        categories={[{ code: 'OF', label: 'Olho fechado', shortcut: 1 }]}
        visible
        onVisibleChange={vi.fn()}
        onReview={onReview}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /aceitar/i }));

    expect(onReview).toHaveBeenCalledWith(suggestion, 'accepted');
    expect(screen.getByText(/91%/)).toBeInTheDocument();
  });
});
