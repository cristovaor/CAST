import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EEGAnalysisRun, EEGSignalQualitySnapshot } from '../useEEG';
import { ApiError } from '@/lib/api';
import { ChannelQualityExplorer, MDMPResult, PowerResult, QueryState, ResearchQuestionNavigator, StatsResult, TimeseriesResult } from './EEGAnalysisWorkspace';

const run = { id: 'run-123', profile: 'custom', package_version: '2.0' } as EEGAnalysisRun;

afterEach(cleanup);

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

describe('Unavailable EEG results', () => {
  const individualRun = { ...run, status: 'succeeded', scope_type: 'session', step_status: {} } as EEGAnalysisRun;

  it('explains why individual paired statistics are not applicable', () => {
    render(<StatsResult query={{ isLoading: false, isError: false, data: {
      schema: 'eeg-result-v1', results: [], reason: 'Uma única sessão não fornece pares independentes.',
    } }} run={individualRun} footer={null} />);
    expect(screen.getByText('Uma única sessão não fornece pares independentes.')).toBeInTheDocument();
    expect(screen.queryByText(/dados e parâmetros atuais/)).not.toBeInTheDocument();
  });

  it('shows the recorded stage failure', () => {
    render(<QueryState title="Topomapas indisponíveis" resultType="topomaps" query={{ isLoading: false, isError: false }} run={{
      ...individualRun, step_status: { topomaps: { status: 'failed', message: 'Montagem sem posições disponíveis.' } },
    }} />);
    expect(screen.getByText('Montagem sem posições disponíveis.')).toBeInTheDocument();
  });

  it('explains that an old individual run needs a new analysis', () => {
    render(<QueryState title="MDMP não disponível" resultType="mdmp" query={{ isLoading: false, isError: true, error: new ApiError('unavailable', 409) }} run={individualRun} />);
    expect(screen.getByText(/Execute uma nova análise/)).toBeInTheDocument();
    expect(screen.queryByText(/Verifique a conexão/)).not.toBeInTheDocument();
  });

  it('distinguishes network failures from absent scientific results', () => {
    render(<QueryState title="MDMP não disponível" resultType="mdmp" query={{ isLoading: false, isError: true, error: new ApiError('server error', 500) }} run={individualRun} />);
    expect(screen.getByText(/Verifique a conexão/)).toBeInTheDocument();
    expect(screen.queryByText(/Execute uma nova análise/)).not.toBeInTheDocument();
  });

  it('displays scientific exclusions from the envelope', () => {
    render(<QueryState title="MDMP não disponível" resultType="mdmp" query={{ isLoading: false, isError: false, data: {
      schema: 'eeg-result-v1', warnings: ['MDMP omitted: requires at least ten complete observations and two nodes'],
    } }} run={individualRun} />);
    expect(screen.getByText(/dez observações completas e dois nós/)).toBeInTheDocument();
  });

  it('finds a valid study network after an excluded subject', () => {
    render(<MDMPResult query={{ isLoading: false, isError: false, data: {
      schema: 'eeg-result-v1', networks: [
        { nodes: [], warnings: ['insufficient data'] },
        { nodes: [{ id: 'Fp1::alpha', label: 'Fp1::alpha' }, { id: 'Fp2::alpha', label: 'Fp2::alpha' }], edges: [], sample_count: 30 },
      ],
    } }} run={individualRun} artifacts={[]} footer={null} />);
    expect(screen.getByRole('img', { name: 'Rede direcionada MDMP' })).toBeInTheDocument();
    expect(screen.getByText('Fp1::alpha')).toBeInTheDocument();
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
