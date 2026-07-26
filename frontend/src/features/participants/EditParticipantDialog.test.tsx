import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Participant } from '@/types/domain';
import { EditParticipantDialog } from './EditParticipantDialog';

const {
  updateMutate,
  updateReset,
  deactivateMutate,
  deactivateReset,
  activateMutate,
  activateReset,
} = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  updateReset: vi.fn(),
  deactivateMutate: vi.fn(),
  deactivateReset: vi.fn(),
  activateMutate: vi.fn(),
  activateReset: vi.fn(),
}));

vi.mock('./useParticipants', () => ({
  useUpdateParticipant: () => ({
    mutate: updateMutate,
    reset: updateReset,
    isError: false,
    isPending: false,
    error: null,
  }),
  useDeactivateParticipant: () => ({
    mutate: deactivateMutate,
    reset: deactivateReset,
    isError: false,
    isPending: false,
    error: null,
  }),
  useActivateParticipant: () => ({
    mutate: activateMutate,
    reset: activateReset,
    isError: false,
    isPending: false,
    error: null,
  }),
}));

const participant: Participant = {
  id: 'participant-1',
  study_id: 'study-1',
  external_code: 'P-0042',
  demographic_group: {
    cohort: 'Controle',
    age_range: '25-34',
    legacy_variable: 'preservar',
    enrollment: {
      eligibility_confirmed: true,
      direct_identifiers_excluded: true,
    },
  },
  consent_status: 'accepted',
  is_active: true,
  created_at: '2026-07-26T10:00:00Z',
};

describe('EditParticipantDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits structured academic fields without exposing JSON', () => {
    render(
      <EditParticipantDialog participant={participant}>
        <button type="button">Abrir edição</button>
      </EditParticipantDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir edição' }));
    expect(screen.queryByText('Grupo demográfico (JSON)')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Controle')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Grupo, braço ou coorte'), {
      target: { value: 'Intervenção A' },
    });
    fireEvent.change(screen.getByLabelText('Escolaridade'), {
      target: { value: 'postgraduate' },
    });
    fireEvent.click(screen.getByText('Revogado'));
    fireEvent.change(screen.getByLabelText('Versão do TCLE revogado'), {
      target: { value: 'TCLE 2.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: 'participant-1',
        external_code: 'P-0042',
        consent_status: 'revoked',
        consent_version: 'TCLE 2.1',
        demographic_group: {
          legacy_variable: 'preservar',
          cohort: 'Intervenção A',
          age_range: '25-34',
          education_level: 'postgraduate',
          enrollment: {
            eligibility_confirmed: true,
            direct_identifiers_excluded: true,
          },
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('requires a documented confirmation before deactivation', () => {
    render(
      <EditParticipantDialog participant={participant}>
        <button type="button">Abrir edição</button>
      </EditParticipantDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir edição' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desativar participante' }));

    const confirmButton = screen.getByRole('button', { name: 'Confirmar desativação' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo da desativação'), {
      target: { value: 'Participante concluiu todas as etapas previstas.' },
    });
    fireEvent.click(screen.getByText('Confirmo a interrupção de novas coletas'));
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    expect(deactivateMutate).toHaveBeenCalledWith(
      {
        id: 'participant-1',
        reason: 'Participante concluiu todas as etapas previstas.',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
