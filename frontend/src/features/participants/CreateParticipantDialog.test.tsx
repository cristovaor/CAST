import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateParticipantDialog } from './CreateParticipantDialog';

const { mutateMock, resetMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  resetMock: vi.fn(),
}));

vi.mock('@/features/studies/useStudies', () => ({
  useStudies: () => ({
    data: [
      {
        id: 'study-1',
        name: 'Estudo de atenção sustentada',
        status: 'active',
        protocol_version: '3.2',
        config: { ethicsApprovalRef: 'CAAE 12345678.9.0000.5208' },
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('./useParticipants', () => ({
  useCreateParticipant: () => ({
    mutate: mutateMock,
    reset: resetMock,
    isError: false,
    isPending: false,
  }),
}));

describe('CreateParticipantDialog', () => {
  it('guides an academic enrollment and submits structured metadata', () => {
    render(
      <CreateParticipantDialog>
        <button type="button">Abrir cadastro</button>
      </CreateParticipantDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir cadastro' }));
    expect(screen.getByRole('heading', { name: 'Registro de participante' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Estudo de destino *'), {
      target: { value: 'study-1' },
    });
    fireEvent.change(screen.getByLabelText('Código pseudonimizado *'), {
      target: { value: 'p-0042' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    fireEvent.change(screen.getByLabelText('Grupo, braço ou coorte'), {
      target: { value: 'Grupo controle' },
    });
    fireEvent.change(screen.getByLabelText('Faixa etária'), {
      target: { value: '25-34' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    fireEvent.click(screen.getByText('Aceito'));
    fireEvent.change(screen.getByLabelText('Versão do TCLE *'), {
      target: { value: 'TCLE 2.1' },
    });
    fireEvent.click(screen.getByText('Critérios de elegibilidade conferidos'));
    fireEvent.click(screen.getByText('Ausência de identificadores diretos'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('CAAE 12345678.9.0000.5208')).toBeInTheDocument();
    expect(screen.getByText('Aceito · versão TCLE 2.1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar participante' }));

    expect(mutateMock).toHaveBeenCalledWith(
      {
        study_id: 'study-1',
        external_code: 'P-0042',
        consent_status: 'accepted',
        consent_version: 'TCLE 2.1',
        demographic_group: {
          cohort: 'Grupo controle',
          age_range: '25-34',
          enrollment: {
            eligibility_confirmed: true,
            direct_identifiers_excluded: true,
          },
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
