import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionAnnotationRedirectPage } from './SessionAnnotationRedirectPage';

const { useSessionDetailMock } = vi.hoisted(() => ({ useSessionDetailMock: vi.fn() }));
vi.mock('@/features/multimodal/useMultimodal', () => ({ useSessionDetail: useSessionDetailMock }));

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/sessions/session-1/annotate']}>
      <Routes>
        <Route path="/app/sessions/:sessionId/annotate" element={<SessionAnnotationRedirectPage />} />
        <Route path="/app/acquisition" element={<h1>Aquisição</h1>} />
        <Route path="/app/videos/video-1/annotations" element={<h1>Anotações do vídeo</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SessionAnnotationRedirectPage', () => {
  it.each([false, true])('keeps acquisition accessible without a video when session loading failed=%s', (isError) => {
    useSessionDetailMock.mockReturnValue({
      data: isError ? undefined : { id: 'session-1', video_asset_id: null }, isLoading: false, isError,
    });
    renderPage();
    if (isError) expect(screen.getByText('Não foi possível carregar a sessão.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Abrir aquisição' });
    expect(link).toHaveAttribute('href', '/app/acquisition');
    fireEvent.click(link);
    expect(screen.getByRole('heading', { name: 'Aquisição' })).toBeInTheDocument();
  });

  it('redirects a session with a video to the annotation editor', () => {
    useSessionDetailMock.mockReturnValue({ data: { video_asset_id: 'video-1' }, isLoading: false, isError: false });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Anotações do vídeo' })).toBeInTheDocument();
  });
});
