import { useTranslation } from 'react-i18next';
import { statusLabel } from '@/lib/formatters';
import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useSessions, type SessionListItem } from '@/features/sessions/useSessions';
import { useStudies } from '@/features/studies/useStudies';

type TargetKind = 'study' | 'session';

interface SelectTargetDialogProps {
  children: ReactNode;
  target: TargetKind;
  title: string;
  description: string;
  confirmLabel?: string;
  onSelect: (id: string, session?: SessionListItem) => void;
}

export function SelectTargetDialog({
  children,
  target,
  title,
  description,
  confirmLabel,
  onSelect,
}: SelectTargetDialogProps) {
  const { t } = useTranslation('acquisition');
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const studiesQuery = useStudies();
  const sessionsQuery = useSessions();

  const isLoading = target === 'study' ? studiesQuery.isLoading : sessionsQuery.isLoading;
  const isError = target === 'study' ? studiesQuery.isError : sessionsQuery.isError;
  const options = useMemo(() => {
    if (target === 'study') {
      return (studiesQuery.data ?? []).map((study) => ({
        id: study.id,
        label: study.name,
        detail: statusLabel(study.status),
      }));
    }
    return (sessionsQuery.data ?? []).map((session) => ({
      id: session.id,
      label: t('select.sessionLabel', { id: shortId(session.id) }),
      detail: t('select.sessionDetail', { study: shortId(session.study_id), participant: shortId(session.participant_id) }),
    }));
  }, [sessionsQuery.data, studiesQuery.data, t, target]);

  const handleConfirm = () => {
    if (!selectedId) return;
    const session = target === 'session'
      ? sessionsQuery.data?.find((item) => item.id === selectedId)
      : undefined;
    onSelect(selectedId, session);
    setOpen(false);
    setSelectedId('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-surface text-text-primary border-border">
        <DialogHeader>
          <DialogTitle className="text-text-primary">{title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{description}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              {t('select.loading')}
            </div>
          ) : isError ? (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle size={17} aria-hidden="true" />
              {t('select.loadFailed')}
            </div>
          ) : options.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-text-secondary">
              {target === 'study' ? t('select.noStudies') : t('select.noSessions')}
            </p>
          ) : (
            <label className="block space-y-2 text-sm font-medium text-text-primary">
              {target === 'study' ? t('select.study') : t('select.session')}
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('select.placeholder')}</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} — {option.detail}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <DialogFooter>
          <ActionButton type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('select.cancel')}
          </ActionButton>
          <ActionButton
            type="button"
            variant="primary"
            disabled={!selectedId || isLoading}
            onClick={handleConfirm}
          >
            {confirmLabel ?? t('select.continue')}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}
