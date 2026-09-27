import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EEGAnalysisRun, EEGSignalQualitySnapshot } from '../useEEG';
import { ChannelQualityExplorer, PowerResult, ResearchQuestionNavigator, TimeseriesResult } from './EEGAnalysisWorkspace';

const run = { id: 'run-123', profile: 'custom', package_version: '2.0' } as EEGAnalysisRun;

function snapshot(offset = 0): EEGSignalQualitySnapshot {
  return {
    threshold_uv: 150,
    overall_valid_ratio: 0.96 + offset,
    p95_abs_centered_uv: 18,
    channels: Array.from({ length: 10 }, (_, index) => ({
      name: `C${index + 1}`,
      valid_ratio: Math.min(0.99, 0.8 + index * 0.02 + offset),
      p95_abs_centered_uv: 40 - index,
      median_offset_uv: 0,
    })),
  };
}

describe('ResearchQuestionNavigator', () => {
  it('navigates by research question instead of exposing all result jargon at once', () => {
    const onChange = vi.fn();
    render(<ResearchQuestionNavigator activeTab="Sinal e qualidade" onChange={onChange} />);

    expect(screen.getByRole('heading', { name: 'O sinal é aproveitável?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(onChange).toHaveBeenCalledWith('Espectro e bandas');
  });
});

describe('ChannelQualityExplorer', () => {
  it('starts with the weakest channels and reveals detail on demand', () => {
    render(<ChannelQualityExplorer before={snapshot(-0.3)} after={snapshot()} />);

    expect(screen.getByRole('button', { name: /C8/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /C10/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /todos \(10\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /C10/i }));

    expect(screen.getByRole('region', { name: /detalhes do canal C10/i })).toBeInTheDocument();
    expect(screen.getByText('Variação')).toBeInTheDocument();
  });
});

describe('EEG result filters', () => {
  it('changes the displayed spectral measure and band', () => {
    render(<PowerResult query={{ isLoading: false, isError: false, data: {
      schema: 'eeg-result-v1',
      power: [
        { level: 'roi', roi: 'frontal', band: 'alpha', absolute_power: 10, relative_power: 0.2 },
        { level: 'roi', roi: 'frontal', band: 'beta', absolute_power: 4, relative_power: 0.1 },
        { level: 'channel', channel: 'Fp1', band: 'beta', absolute_power: 3, relative_power: 0.08 },
      ],
    } }} run={run} footer={null} />);

    expect(screen.getByRole('heading', { name: 'Potência absoluta · alpha' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Banda EEG' }), { target: { value: 'beta' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Medida de potência EEG' }), { target: { value: 'relative_power' } });
    expect(screen.getByRole('heading', { name: 'Potência relativa · beta' })).toBeInTheDocument();
    expect(screen.getByText('1 de 2 resultados')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Nível de agregação EEG' }), { target: { value: 'channel' } });
    expect(screen.getByRole('option', { name: 'Fp1' })).toBeInTheDocument();
    expect(screen.getByText('1 de 1 resultado')).toBeInTheDocument();
  });

  it('filters temporal data by band and region', () => {
    render(<TimeseriesResult query={{ isLoading: false, isError: false, data: {
      schema: 'eeg-result-v1',
      points: [
        { time_seconds: 1, state: 'aula', roi: 'frontal', band: 'alpha', metric: 'absolute_power', value: 10 },
        { time_seconds: 2, state: 'aula', roi: 'occipital', band: 'beta', metric: 'absolute_power', value: 4 },
      ],
    } }} run={run} footer={null} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Banda da série EEG' }), { target: { value: 'beta' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Região ou canal da série EEG' }), { target: { value: 'occipital' } });
    expect(screen.getByRole('heading', { name: 'Potência deslizante · beta' })).toBeInTheDocument();
    expect(screen.getByText(/1 ponto na seleção/)).toBeInTheDocument();
  });
});
