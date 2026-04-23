import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { REPORT_TYPES } from '@/lib/constants';
import {
  importBatch,
  type BatchProgress,
  type BatchResult,
  BatchRollbackError,
} from '@/lib/importService';
import BatchDropSlot, { type BatchDropSlotValue } from '@/components/upload/BatchDropSlot';
import UploadHistoryRow, { type UploadRow } from '@/components/upload/UploadHistoryRow';
import { useUploadHistory } from '@/hooks/useLeadData';
import { useAuth } from '@/hooks/useAuth';

type Step = 'select' | 'preview' | 'importing' | 'summary';

interface BatchState {
  dailyCall: BatchDropSlotValue | null;
  deerDama: BatchDropSlotValue | null;
  uploadDate: string;
  notes: string;
  step: Step;
  progress: BatchProgress | null;
  result: BatchResult | null;
  rollbackMessage: string | null;
}

const initialState: BatchState = {
  dailyCall: null,
  deerDama: null,
  uploadDate: new Date().toISOString().split('T')[0],
  notes: '',
  step: 'select',
  progress: null,
  result: null,
  rollbackMessage: null,
};

export default function UploadCenter() {
  const { agencyId, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const uploadHistory = useUploadHistory();

  const historyRows = (uploadHistory.data ?? []) as UploadRow[];
  const grouped: Array<{ batchId: string | null; rows: UploadRow[] }> = [];
  const seen = new Set<string>();
  for (const row of historyRows) {
    if (row.batch_id) {
      if (seen.has(row.batch_id)) continue;
      seen.add(row.batch_id);
      grouped.push({
        batchId: row.batch_id,
        rows: historyRows.filter((r) => r.batch_id === row.batch_id),
      });
    } else {
      grouped.push({ batchId: null, rows: [row] });
    }
  }

  const [state, setState] = useState<BatchState>(initialState);
  const [duplicatePrompt, setDuplicatePrompt] = useState<BatchResult['duplicateOf'] | null>(null);

  const runBatch = async (force: boolean) => {
    if (!state.dailyCall || !state.deerDama || !agencyId) return;
    setState((prev) => ({ ...prev, step: 'importing', progress: null, rollbackMessage: null }));

    const onProgress = (p: BatchProgress) => {
      setState((prev) => ({ ...prev, progress: p }));
    };

    try {
      const result = await importBatch(
        state.dailyCall.file,
        state.deerDama.file,
        agencyId,
        state.uploadDate,
        state.notes,
        onProgress,
        force,
      );

      if (result.duplicateOf && !force) {
        setDuplicatePrompt(result.duplicateOf);
        setState((prev) => ({ ...prev, step: 'preview', progress: null }));
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      await queryClient.invalidateQueries({ queryKey: ['staffPerf'] });
      await queryClient.invalidateQueries({ queryKey: ['uploads'] });
      await queryClient.invalidateQueries({ queryKey: ['leadList'] });

      setState((prev) => ({ ...prev, step: 'summary', result }));
    } catch (err) {
      const message =
        err instanceof BatchRollbackError
          ? err.message
          : 'Batch import failed: ' + String(err);
      await queryClient.invalidateQueries({ queryKey: ['uploads'] });
      setState((prev) => ({
        ...prev,
        step: 'summary',
        rollbackMessage: message,
        result: {
          batchId: '',
          dailyCall: { uploadId: '', rowsTotal: 0, rowsImported: 0, rowsFiltered: 0, rowsSkipped: 0, newLeads: 0, updatedLeads: 0, errors: [] },
          deerDama: { uploadId: '', rowsTotal: 0, rowsImported: 0, rowsFiltered: 0, rowsSkipped: 0, newLeads: 0, updatedLeads: 0, errors: [] },
          rolledBack: true,
        },
      }));
    }
  };

  const handleImport = () => runBatch(false);

  const handleDuplicateConfirm = () => {
    setDuplicatePrompt(null);
    void runBatch(true);
  };

  const handleDuplicateCancel = () => setDuplicatePrompt(null);

  const reset = () => {
    setDuplicatePrompt(null);
    setState(initialState);
  };

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          Upload Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import Daily Call Reports and Deer Dama (Lead) Reports from Ricochet
        </p>
      </div>

      {/* ── Step: Select Files ────────────────────────────────────────────── */}
      {state.step === 'select' && (
        <div className="max-w-3xl">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Upload Date</label>
              <input
                type="date"
                value={state.uploadDate}
                onChange={(e) => setState((prev) => ({ ...prev, uploadDate: e.target.value }))}
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Notes (optional)</label>
              <input
                type="text"
                value={state.notes}
                onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Morning batch, Apr 23"
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <BatchDropSlot
              expectedType={REPORT_TYPES.DAILY_CALL}
              label="Daily Call Report"
              value={state.dailyCall}
              onChange={(v) => setState((prev) => ({ ...prev, dailyCall: v }))}
            />
            <BatchDropSlot
              expectedType={REPORT_TYPES.DEER_DAMA}
              label="Deer Dama (Lead) Report"
              value={state.deerDama}
              onChange={(v) => setState((prev) => ({ ...prev, deerDama: v }))}
            />
          </div>

          {!agencyId && (
            <div className="flex items-center gap-2 mt-4 px-3 py-2 bg-destructive/10 rounded-md">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">No agency assigned to your account. Contact your administrator.</span>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => setState((prev) => ({ ...prev, step: 'preview' }))}
              disabled={
                !state.dailyCall ||
                !state.deerDama ||
                !state.dailyCall.typeMatches ||
                !state.deerDama.typeMatches ||
                !state.uploadDate
              }
            >
              Continue to Preview
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Preview ─────────────────────────────────────────────────── */}
      {state.step === 'preview' && (
        <div className="max-w-4xl space-y-8">
          {(['dailyCall', 'deerDama'] as const).map((key) => {
            const slot = state[key];
            if (!slot) return null;
            const label = key === 'dailyCall' ? 'Daily Call Report' : 'Deer Dama (Lead) Report';
            return (
              <div key={key}>
                <h2 className="text-base font-semibold text-foreground mb-2">{label}</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  {slot.file.name} — {slot.columns.length} columns
                </p>
                <div className="border rounded-md overflow-auto max-h-[240px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        {slot.columns.map((c) => (
                          <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slot.previewRows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {slot.columns.map((c) => (
                            <td key={c} className="px-3 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate">
                              {row[c] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {!agencyId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 rounded-md">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">No agency assigned to your account. Contact your administrator.</span>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setState((prev) => ({ ...prev, step: 'select' }))}>
              Back
            </Button>
            <Button onClick={handleImport} disabled={!agencyId}>
              Import Batch
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Importing ───────────────────────────────────────────────── */}
      {state.step === 'importing' && (
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Importing batch
                {state.progress && ` — file ${state.progress.fileIndex} of 2`}
              </p>
              <p className="text-xs text-muted-foreground">
                {state.progress
                  ? `${state.progress.currentFile === 'daily_call' ? 'Daily Call' : 'Deer Dama'}: ${state.progress.phase} (${state.progress.processed}/${state.progress.total})`
                  : 'Starting…'}
              </p>
            </div>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: state.progress
                  ? `${Math.min(100, ((state.progress.fileIndex - 1) * 50) + ((state.progress.processed / Math.max(1, state.progress.total)) * 50))}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Step: Summary ─────────────────────────────────────────────────── */}
      {state.step === 'summary' && (
        <div className="max-w-3xl">
          {state.rollbackMessage ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Batch rolled back</p>
                  <p className="text-xs text-destructive/80 mt-1">{state.rollbackMessage}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    No data was imported. Fix the issue and try again.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-success/50 bg-success/10 p-4 mb-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <p className="text-sm font-medium text-success">Batch imported successfully</p>
              </div>
            </div>
          )}

          {state.result && !state.rollbackMessage && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {(['dailyCall', 'deerDama'] as const).map((key) => {
                const r = state.result![key];
                const title = key === 'dailyCall' ? 'Daily Call Report' : 'Deer Dama (Lead) Report';
                return (
                  <div key={key} className="border rounded-md p-4 bg-card">
                    <p className="text-sm font-medium text-foreground mb-2">{title}</p>
                    <dl className="grid grid-cols-2 gap-1 text-xs">
                      <dt className="text-muted-foreground">Rows imported</dt>
                      <dd className="text-right tabular-nums">{r.rowsImported}</dd>
                      <dt className="text-muted-foreground">Filtered</dt>
                      <dd className="text-right tabular-nums">{r.rowsFiltered}</dd>
                      <dt className="text-muted-foreground">Skipped</dt>
                      <dd className="text-right tabular-nums">{r.rowsSkipped}</dd>
                      <dt className="text-muted-foreground">New leads</dt>
                      <dd className="text-right tabular-nums">{r.newLeads}</dd>
                      <dt className="text-muted-foreground">Updated leads</dt>
                      <dd className="text-right tabular-nums">{r.updatedLeads}</dd>
                    </dl>
                    {r.errors.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="text-warning cursor-pointer">{r.errors.length} warnings</summary>
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {r.errors.slice(0, 20).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={reset}>Upload another batch</Button>
          </div>
        </div>
      )}

      {/* ── Duplicate-import confirmation ─────────────────────────────────── */}
      <AlertDialog open={!!duplicatePrompt} onOpenChange={(open) => !open && handleDuplicateCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate file detected</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {duplicatePrompt?.dailyCall && (
                  <p>
                    The Daily Call file matches a previous import:{' '}
                    <strong>{duplicatePrompt.dailyCall.fileName}</strong> ({duplicatePrompt.dailyCall.uploadDate}).
                  </p>
                )}
                {duplicatePrompt?.deerDama && (
                  <p>
                    The Deer Dama file matches a previous import:{' '}
                    <strong>{duplicatePrompt.deerDama.fileName}</strong> ({duplicatePrompt.deerDama.uploadDate}).
                  </p>
                )}
                <p>Import anyway?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDuplicateCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicateConfirm}>Import Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Recent Uploads ────────────────────────────────────────────────── */}
      {state.step === 'select' && (
        <div className="mt-8">
          <h3 className="section-title mb-4">Recent Uploads</h3>
          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {['File', 'Type', 'Date', 'Rows', 'Imported', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-foreground">{h}</th>
                  ))}
                  <th className="px-4 py-2.5 w-10" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {uploadHistory.isLoading && Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-4 py-2.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-2.5" />
                  </tr>
                ))}
                {!uploadHistory.isLoading && grouped.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No uploads yet</td></tr>
                )}
                {grouped.map((group) => (
                  <UploadHistoryRow
                    key={group.batchId ?? group.rows[0].id}
                    batchId={group.batchId}
                    rows={group.rows}
                    isAdmin={isAdmin}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
