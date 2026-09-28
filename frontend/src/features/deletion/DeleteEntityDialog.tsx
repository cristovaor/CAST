import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, HardDrive, Loader2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { toast, toErrorMessage } from '@/app/stores/useToastStore';
import {
  type DeletableEntity,
  type DeletionImpact,
  useDeleteEntity,
  useDeletionImpact,
} from './useDeletion';

const MIN_JUSTIFICATION = 10;

/** Tables worth naming in the summary; the rest are folded into one line. */
const NAMED_TABLES = [
  'projects',
  'studies',
  'participants',
  'sessions',
  'video_assets',
  'eeg_assets',
  'landmark_artifacts',
  'annotation_events',
  'predictions',
  'processing_jobs',
  'analysis_reports',
  'consent_terms',
] as const;

interface DeleteEntityDialogProps {
  entityType: DeletableEntity;
  entityId: string;
  /** Element that opens the dialog, e.g. a menu item or icon button. */
  children?: ReactNode;
  /** Controlled mode, for callers that open it from a menu. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteEntityDialog({
  entityType,
  entityId,
  children,
  open: controlledOpen,
  onOpenChange,
  onDeleted,
}: DeleteEntityDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      {open && (
        <DeleteEntityForm
          entityType={entityType}
          entityId={entityId}
          onDone={() => {
            setOpen(false);
            onDeleted?.();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}

function DeleteEntityForm({
  entityType,
  entityId,
  onDone,
  onCancel,
}: {
  entityType: DeletableEntity;
  entityId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('deletion');
  const impact = useDeletionImpact(entityType, entityId, true);
  const remove = useDeleteEntity(entityType, entityId);
  const [justification, setJustification] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const justificationId = useId();
  const confirmationId = useId();

  const phrase = impact.data?.confirmation_phrase ?? '';
  const ready =
    impact.data?.can_delete === true &&
    justification.trim().length >= MIN_JUSTIFICATION &&
    confirmation.trim() === phrase.trim() &&
    phrase !== '';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !impact.data) return;
    const label = impact.data.label;
    remove.mutate(
      { confirmation: confirmation.trim(), justification: justification.trim() },
      {
        onSuccess: () => {
          toast.success(t('success', { label }));
          onDone();
        },
      },
    );
  };

  const forbidden = impact.error && 'status' in impact.error && impact.error.status === 403;

  return (
    <DialogContent className="max-w-lg" onInteractOutside={(e) => remove.isPending && e.preventDefault()}>
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
            {t(`title.${entityType}`)}
            {impact.data && (
              <span className="truncate font-normal text-text-secondary">— {impact.data.label}</span>
            )}
          </DialogTitle>
          <DialogDescription>{t('warning')}</DialogDescription>
        </DialogHeader>

        {impact.isLoading && (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('impactLoading')}
          </p>
        )}
        {impact.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {forbidden ? t('noPermission') : t('impactError', { message: toErrorMessage(impact.error) })}
            </AlertDescription>
          </Alert>
        )}
        {impact.data && <ImpactSummary impact={impact.data} />}

        {impact.data && impact.data.active_jobs > 0 && (
          <Alert variant="destructive">
            <AlertDescription>{t('activeJobs', { count: impact.data.active_jobs })}</AlertDescription>
          </Alert>
        )}

        {impact.data?.can_delete && (
          <>
            <div className="space-y-1.5">
              <label htmlFor={justificationId} className="text-sm font-medium text-text-primary">
                {t('justification')}
              </label>
              <textarea
                id={justificationId}
                required
                minLength={MIN_JUSTIFICATION}
                maxLength={2000}
                rows={3}
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                placeholder={t('justificationPlaceholder')}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-text-muted">{t('justificationHint')}</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={confirmationId} className="text-sm text-text-primary">
                <Trans
                  t={t}
                  i18nKey="confirmLabel"
                  values={{ phrase }}
                  components={{
                    code: <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-red-700 dark:text-red-300" />,
                  }}
                />
              </label>
              <Input
                id={confirmationId}
                autoComplete="off"
                spellCheck={false}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          </>
        )}

        {remove.isError && (
          <Alert variant="destructive">
            <AlertDescription>{toErrorMessage(remove.error)}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={remove.isPending}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="destructive" disabled={!ready} isLoading={remove.isPending}>
            {remove.isPending ? t('deleting') : t('confirm')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ImpactSummary({ impact }: { impact: DeletionImpact }) {
  const { t } = useTranslation('deletion');
  const named = NAMED_TABLES.filter((table) => (impact.counts[table] ?? 0) > 0);
  const others = Object.entries(impact.counts)
    .filter(([table]) => !(NAMED_TABLES as readonly string[]).includes(table))
    .reduce((sum, [, count]) => sum + count, 0);
  const detached = Object.values(impact.detached).reduce((sum, count) => sum + count, 0);

  return (
    <section aria-label={t('impactTitle')} className="rounded-lg border border-border bg-surface-muted/50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t('impactTitle')}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {named.map((table) => (
          <div key={table} className="flex justify-between gap-2">
            <dt className="text-text-secondary">{t(`tables.${table}`)}</dt>
            <dd className="font-medium tabular-nums text-text-primary">{impact.counts[table]}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
        {others > 0 && <li>{t('otherRecords', { count: others })}</li>}
        {impact.storage_objects > 0 && (
          <li className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" aria-hidden="true" />
            {t('storageObjects', { count: impact.storage_objects })}
          </li>
        )}
        {detached > 0 && <li>{t('detached', { count: detached })}</li>}
      </ul>
    </section>
  );
}
