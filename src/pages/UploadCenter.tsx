import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Download, Trash2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { REPORT_TYPES } from '@/lib/constants';
import {
  importBatch,
  resumeBatch,
  clearAllSalesData,
  clearStuckUploads,
  BatchRollbackError,
  type BatchProgress,
  type BatchResult,
  type ParsedBatchState,
  type RequoteDecision,
} from '@/lib/importService';
import { importSalesLog, type ImportResult as SalesImportResult } from '@/lib/importSalesLog';
import type { RicochetMatch } from '@/lib/importRicochet';
import type { RicochetRowParseError } from '@/lib/ricochetParser';
import BatchDropSlot, { type BatchDropSlotValue } from '@/components/upload/BatchDropSlot';
import UploadHistoryRow, { type UploadRow } from '@/components/upload/UploadHistoryRow';
import RequoteReviewDialog from '@/components/upload/RequoteReviewDialog';
import { useUploadHistory } from '@/hooks/useLeadData';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type Step = 'select' | 'preview' | 'importing' | 'requote_review' | 'summary';

interface BatchState {
  ricochet: BatchDropSlotValue | null;
  dailyCall: BatchDropSlotValue | null;
  deerDama: BatchDropSlotValue | null;
  uploadDate: string;
  notes: string;
  step: Step;
  progress: BatchProgress | null;
  result: BatchResult | null;
  rollbackMessage: string | null;
  requoteMatches: RicochetMatch[] | null;
  parsedState: ParsedBatchState | null;
  pendingBatchId: string | null;
}

type DuplicateInfo = NonNullable<BatchResult['duplicateOf']>;

interface SkippedRow {
  rowNumber: number;
  errorMessage: string;
  rawData: Record<string, unknown>;
}

const initialState: BatchState = {
  ricochet: null,
  dailyCall: null,
  deerDama: null,
  uploadDate: new Date().toISOString().split('T')[0],
  notes: '',
  step: 'select',
  progress: null,
  result: null,
  rollbackMessage: null,
  requoteMatches: null,
  parsedState: null,
  pendingBatchId: null,
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
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicateInfo | null>(null);

  // ── Independent Sales Log upload state ────────────────────────────────────
  const [salesSlot, setSalesSlot] = useState<BatchDropSlotValue | null>(null);
  const [salesDate, setSalesDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [salesImporting, setSalesImporting] = useState(false);
  const [salesResult, setSalesResult] = useState<SalesImportResult | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);

  const runSalesImport = async () => {
    if (!salesSlot?.file || !agencyId) return;
    setSalesImporting(true);
    setSalesResult(null);
    setSalesError(null);
    try {
      const result = await importSalesLog(salesSlot.file, agencyId, salesDate, null);
      setSalesResult(result);
      await queryClient.invalidateQueries({ queryKey: ['uploads'] });
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      setSalesError(String(err));
    } finally {
      setSalesImporting(false);
    }
  };
  const [skippedModal, setSkippedModal] = useState<
    { title: string; uploadId: string } | null
  >(null);
  const [ricochetErrorsModalOpen, setRicochetErrorsModalOpen] = useState(false);

  // ── Clear Sales Data state ────────────────────────────────────────────────
  const [clearStuckOpen, setClearStuckOpen] = useState(false);
  const [clearStuckRunning, setClearStuckRunning] = useState(false);
  const [clearStuckResult, setClearStuckResult] = useState<{ uploadsCleared: number; batchesCleared: number } | null>(null);
  const [clearStuckError, setClearStuckError] = useState<string | null>(null);

  const handleClearStuckUploads = async () => {
    if (!agencyId) return;
    setClearStuckRunning(true);
    setClearStuckError(null);
    setClearStuckResult(null);
    try {
      const res = await clearStuckUploads(agencyId);
      setClearStuckResult({ uploadsCleared: res.uploadsCleared, batchesCleared: res.batchesCleared });
      if (res.errors.length > 0) setClearStuckError(res.errors.join('; '));
      await queryClient.invalidateQueries({ queryKey: ['uploads'] });
    } catch (err) {
      setClearStuckError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearStuckRunning(false);
      setClearStuckOpen(false);
    }
  };

  const [clearSalesOpen, setClearSalesOpen] = useState(false);
  const [clearSalesRunning, setClearSalesRunning] = useState(false);
  const [clearSalesResult, setClearSalesResult] = useState<
    { salesEventsDeleted: number; autoLeadsDeleted: number; leadsReset: number } | null
  >(null);
  const [clearSalesError, setClearSalesError] = useState<string | null>(null);

  const runClearSalesData = async () => {
    if (!agencyId) return;
    setClearSalesRunning(true);
    setClearSalesError(null);
    setClearSalesResult(null);
    try {
      const res = await clearAllSalesData(agencyId);
      setClearSalesResult(res);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      await queryClient.invalidateQueries({ queryKey: ['leadList'] });
      await queryClient.invalidateQueries({ queryKey: ['uploads'] });
      await queryClient.invalidateQueries({ queryKey: ['staffPerf'] });
    } catch (err) {
      setClearSalesError(String(err));
    } finally {
      setClearSalesRunning(false);
      setClearSalesOpen(false);
    }
  };

  const invalidateCaches = async () => {
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
    await queryClient.invalidateQueries({ queryKey: ['staffPerf'] });
    await queryClient.invalidateQueries({ queryKey: ['uploads'] });
    await queryClient.invalidateQueries({ queryKey: ['leadList'] });
  };

  const onProgress = (p: BatchProgress) =>
    setState((prev) => ({ ...prev, progress: p }));

  const handleBatchError = async (err: unknown) => {
    const message =
      err instanceof BatchRollbackError
        ? err.message
        : 'Batch import failed: ' + String(err);
    await queryClient.invalidateQueries({ queryKey: ['uploads'] });
    setState((prev) => ({
      ...prev,
      step: 'summary',
      rollbackMessage: message,
      result: null,
    }));
  };

  const runBatch = async (force: boolean) => {
    if (!state.ricochet || !state.dailyCall || !state.deerDama || !agencyId) return;
    setState((prev) => ({ ...prev, step: 'importing', progress: null, rollbackMessage: null }));

    try {
      const res = await importBatch({
        ricochetFile: state.ricochet.file,
        dailyCallFile: state.dailyCall.file,
        deerDamaFile: state.deerDama.file,
        agencyId,
        uploadDate: state.uploadDate,
        notes: state.notes,
        onProgress,
        force,
      });

      if (res.status === 'duplicate') {
        setDuplicatePrompt(res.duplicateOf);
        setState((prev) => ({ ...prev, step: 'preview', progress: null }));
        return;
      }

      if (res.status === 'needs_requote_review') {
        setState((prev) => ({
          ...prev,
          step: 'requote_review',
          requoteMatches: res.matches,
          parsedState: res.parsedState,
          pendingBatchId: res.pendingBatchId,
          progress: null,
        }));
        return;
      }

      await invalidateCaches();
      setState((prev) => ({ ...prev, step: 'summary', result: res.result }));
    } catch (err) {
      await handleBatchError(err);
    }
  };

  const handleRequoteConfirm = async (decisions: Map<string, RequoteDecision>) => {
    if (!state.parsedState || !state.pendingBatchId || !agencyId) return;
    setState((prev) => ({ ...prev, step: 'importing', progress: null, rollbackMessage: null }));

    try {
      const res = await resumeBatch({
        pendingBatchId: state.pendingBatchId,
        decisions,
        parsedState: state.parsedState,
        agencyId,
        uploadDate: state.uploadDate,
        notes: state.notes,
        onProgress,
        force: false,
      });

      if (res.status === 'success') {
        await invalidateCaches();
        setState((prev) => ({ ...prev, step: 'summary', result: res.result }));
      }
    } catch (err) {
      await handleBatchError(err);
    }
  };

  const handleRequoteCancel = () => setState(initialState);

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

  const totalFiles = 3;
  const progressPct = state.progress
    ? Math.min(
        100,
        (state.progress.fileIndex * 100) / totalFiles +
          (state.progress.total > 0
            ? (state.progress.processed / state.progress.total) * (100 / totalFiles)
            : 0),
      )
    : 0;

  const currentFileLabel =
    state.progress?.currentFile === 'ricochet'
      ? 'Beacon Lead List'
      : state.progress?.currentFile === 'daily_call'
      ? 'Daily Call'
      : 'Deer Dama';

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          Upload Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import Beacon Lead List, Daily Call Report, and Deer Dama (Lead) Report
        </p>
      </div>

      {/* ── Step: Select Files ────────────────────────────────────────────── */}
      {state.step === 'select' && (
        <>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section>
              <h3 className="text-sm font-semibold mb-2">
                1. Beacon Lead List{' '}
                <span className="text-muted-foreground font-normal">(required first)</span>
              </h3>
              <BatchDropSlot
                expectedType={REPORT_TYPES.RICOCHET_LEAD_LIST}
                label="Beacon Lead List"
                value={state.ricochet}
                onChange={(v) => setState((prev) => ({ ...prev, ricochet: v }))}
              />
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">2. Daily Call Report</h3>
              <BatchDropSlot
                expectedType={REPORT_TYPES.DAILY_CALL}
                label="Daily Call Report"
                value={state.dailyCall}
                onChange={(v) => setState((prev) => ({ ...prev, dailyCall: v }))}
                disabled={!state.ricochet}
                disabledHelperText="Upload the Beacon Lead List first."
              />
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">3. Deer Dama (Lead) Report</h3>
              <BatchDropSlot
                expectedType={REPORT_TYPES.DEER_DAMA}
                label="Deer Dama (Lead) Report"
                value={state.deerDama}
                onChange={(v) => setState((prev) => ({ ...prev, deerDama: v }))}
                disabled={!state.ricochet}
                disabledHelperText="Upload the Beacon Lead List first."
              />
            </section>

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
                !state.ricochet ||
                !state.dailyCall ||
                !state.deerDama ||
                !state.ricochet.typeMatches ||
                !state.dailyCall.typeMatches ||
                !state.deerDama.typeMatches ||
                !state.uploadDate
              }
            >
              Continue to Preview
            </Button>
          </div>
        </div>

        {/* ── Independent Sales Log Upload ─────────────────────────────── */}
        <div className="max-w-3xl mt-8 border rounded-lg bg-card p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Sales Log Upload</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a Sales Log CSV at any time — independent of the daily batch.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Upload Date</label>
              <input
                type="date"
                value={salesDate}
                onChange={(e) => setSalesDate(e.target.value)}
                className="w-full bg-background border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <BatchDropSlot
            expectedType={REPORT_TYPES.SALES_LOG}
            label="Sales Log"
            value={salesSlot}
            onChange={(v) => { setSalesSlot(v); setSalesResult(null); setSalesError(null); }}
          />
          {salesError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {salesError}
            </div>
          )}
          {salesResult && (
            <div className="mt-3 rounded-md border border-success/50 bg-success/10 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2 text-success font-medium mb-1">
                <CheckCircle2 className="w-4 h-4" /> Sales Log imported successfully
              </div>
              <p className="text-muted-foreground">{salesResult.imported} policy rows imported</p>
              <p className="text-muted-foreground">{salesResult.newLeadsCreated} new re-quote leads created from unmatched sales</p>
              <p className="text-muted-foreground">{salesResult.filtered} rows filtered (non-Beacon Territory)</p>
              {salesResult.errors.length > 0 && (
                <p className="text-destructive">{salesResult.errors.length} errors</p>
              )}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              onClick={runSalesImport}
              disabled={!salesSlot || !salesSlot.typeMatches || salesImporting || !agencyId}
            >
              {salesImporting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</>
              ) : (
                'Import Sales Log'
              )}
            </Button>
          </div>
        </div>
        </>
      )}

      {/* ── Step: Preview ─────────────────────────────────────────────────── */}
      {state.step === 'preview' && (
        <div className="max-w-4xl space-y-8">
          {(['ricochet', 'dailyCall', 'deerDama'] as const).map((key) => {
            const slot = state[key];
            if (!slot) return null;
            const label =
              key === 'ricochet'
                ? 'Beacon Lead List'
                : key === 'dailyCall'
                ? 'Daily Call Report'
                : 'Deer Dama (Lead) Report';
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
                {state.progress && ` — file ${state.progress.fileIndex + 1} of ${totalFiles}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {state.progress
                  ? `${currentFileLabel}: ${state.progress.phase} (${state.progress.processed}/${state.progress.total})`
                  : 'Starting…'}
              </p>
            </div>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
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
            <div className="space-y-4 mb-6">
              {state.result.ricochet && (
                <SummaryBlock
                  title="Beacon Lead List"
                  rows={[
                    { icon: 'success', text: `${state.result.ricochet.rowsImported} new leads created` },
                    { icon: 'success', text: `${state.result.ricochet.rowsUpdated} leads updated (overwritten)` },
                    { icon: 'info', text: `${state.result.ricochet.requotesLogged} requotes logged` },
                    {
                      icon: 'warn',
                      text: `${state.result.ricochet.errors.length} rows with parse errors`,
                      onClick:
                        state.result.ricochet.errors.length > 0
                          ? () => setRicochetErrorsModalOpen(true)
                          : undefined,
                    },
                  ]}
                />
              )}
              <SummaryBlock
                title="Daily Call Report"
                rows={[
                  { icon: 'success', text: `${state.result.dailyCall.rowsImported} call events imported` },
                  { icon: 'info', text: `${state.result.dailyCall.updatedLeads} leads updated` },
                  { icon: 'info', text: `${state.result.dailyCall.requoteLeadsCreated ?? 0} re-quote leads auto-created` },
                  {
                    icon: 'warn',
                    text: `${state.result.dailyCall.rowsSkippedUnmatched ?? 0} rows skipped (phone not in leads)`,
                    onClick:
                      (state.result.dailyCall.rowsSkippedUnmatched ?? 0) > 0
                        ? () =>
                            setSkippedModal({
                              title: 'Daily Call — Skipped Rows',
                              uploadId: state.result!.dailyCall.uploadId,
                            })
                        : undefined,
                  },
                ]}
              />
              <SummaryBlock
                title="Deer Dama (Lead) Report"
                rows={[
                  { icon: 'success', text: `${state.result.deerDama.rowsImported} lead records imported` },
                  { icon: 'info', text: `${state.result.deerDama.updatedLeads} leads updated` },
                  {
                    icon: 'warn',
                    text: `${state.result.deerDama.rowsSkippedUnmatched ?? 0} rows skipped (phone not in leads)`,
                    onClick:
                      (state.result.deerDama.rowsSkippedUnmatched ?? 0) > 0
                        ? () =>
                            setSkippedModal({
                              title: 'Deer Dama — Skipped Rows',
                              uploadId: state.result!.deerDama.uploadId,
                            })
                        : undefined,
                  },
                ]}
              />

            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={reset}>Upload another batch</Button>
          </div>
        </div>
      )}

      {/* ── Requote Review Dialog ─────────────────────────────────────────── */}
      <RequoteReviewDialog
        open={state.step === 'requote_review' && state.requoteMatches != null}
        matches={state.requoteMatches ?? []}
        onConfirm={handleRequoteConfirm}
        onCancel={handleRequoteCancel}
      />

      {/* ── Skipped Rows Modal ────────────────────────────────────────────── */}
      <SkippedRowsModal
        open={skippedModal != null}
        title={skippedModal?.title ?? ''}
        uploadId={skippedModal?.uploadId ?? null}
        onClose={() => setSkippedModal(null)}
      />

      {/* ── Ricochet Parse Errors Modal ───────────────────────────────────── */}
      <RicochetParseErrorsModal
        open={ricochetErrorsModalOpen}
        errors={state.result?.ricochet?.errors ?? []}
        onClose={() => setRicochetErrorsModalOpen(false)}
      />

      {/* ── Duplicate-import confirmation ─────────────────────────────────── */}
      <AlertDialog open={!!duplicatePrompt} onOpenChange={(open) => !open && handleDuplicateCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate file detected</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {duplicatePrompt?.ricochet && (
                  <p>
                    The Beacon Lead List file matches a previous import:{' '}
                    <strong>{duplicatePrompt.ricochet.fileName}</strong> ({duplicatePrompt.ricochet.uploadDate}).
                  </p>
                )}
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

      {/* ── Danger Zone ───────────────────────────────────────────────────── */}
      {state.step === 'select' && (
        <div className="mt-8 max-w-3xl">
          <h3 className="section-title mb-4">Danger Zone</h3>
          <div className="border border-destructive/50 rounded-lg bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  Clear All Sales Data
                </p>
                <p className="text-xs text-muted-foreground">
                  Deletes every sales_events row for this agency, removes
                  auto-created sales log re-quote leads (no call activity),
                  and resets the denormalized sold fields on all remaining
                  leads. Use this to clean up orphaned sales data whose
                  upload record has already been deleted.
                </p>
                {clearSalesResult && (
                  <div className="mt-3 rounded-md border border-success/50 bg-success/10 px-3 py-2 text-xs text-foreground">
                    Cleared {clearSalesResult.salesEventsDeleted} sales events,
                    deleted {clearSalesResult.autoLeadsDeleted} auto-created leads,
                    reset sold fields on {clearSalesResult.leadsReset} leads.
                  </div>
                )}
                {clearSalesError && (
                  <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {clearSalesError}
                  </div>
                )}
              </div>
              <Button
                variant="destructive"
                onClick={() => setClearSalesOpen(true)}
                disabled={!agencyId || clearSalesRunning}
                className="shrink-0"
              >
                {clearSalesRunning ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Clearing…</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" />Clear All Sales Data</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={clearSalesOpen} onOpenChange={setClearSalesOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all sales data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every sales event for your agency,
              removes auto-created sales log re-quote leads, and resets the
              sold fields on all remaining leads. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runClearSalesData}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, clear all sales data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearStuckOpen} onOpenChange={setClearStuckOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear stuck uploads?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes any upload rows for your agency that have been in
              "processing" state for more than 5 minutes. Cascade deletes
              their child rows (call_events, lead_staff_history, sales_events)
              and any auto-created leads they orphan. In-flight imports newer
              than 5 minutes are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearStuckUploads}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear stuck uploads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Recent Uploads ────────────────────────────────────────────────── */}
      {state.step === 'select' && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Recent Uploads</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearStuckOpen(true)}
              disabled={!agencyId || clearStuckRunning}
            >
              {clearStuckRunning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Clearing…</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Clear Stuck Uploads</>
              )}
            </Button>
          </div>
          {clearStuckResult && (
            <div className="mb-3 rounded-md border border-success/50 bg-success/10 px-3 py-2 text-xs text-foreground">
              Cleared {clearStuckResult.uploadsCleared} stuck upload
              {clearStuckResult.uploadsCleared === 1 ? '' : 's'}
              {clearStuckResult.batchesCleared > 0 ? ` (${clearStuckResult.batchesCleared} batch${clearStuckResult.batchesCleared === 1 ? '' : 'es'})` : ''}.
            </div>
          )}
          {clearStuckError && (
            <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {clearStuckError}
            </div>
          )}
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

// ─── SummaryBlock ─────────────────────────────────────────────────────────────

type SummaryIcon = 'success' | 'info' | 'warn';

interface SummaryRowSpec {
  icon: SummaryIcon;
  text: string;
  onClick?: () => void;
}

function SummaryBlock({ title, rows }: { title: string; rows: SummaryRowSpec[] }) {
  return (
    <div className="border rounded-md p-4 bg-card">
      <p className="text-sm font-medium text-foreground mb-2">{title}</p>
      <ul className="space-y-1 text-xs">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            {r.icon === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
            {r.icon === 'info' && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />}
            {r.icon === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />}
            {r.onClick ? (
              <button
                onClick={r.onClick}
                className="text-foreground underline underline-offset-2 hover:text-primary text-left"
              >
                {r.text}
              </button>
            ) : (
              <span className="text-foreground">{r.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── SkippedRowsModal ─────────────────────────────────────────────────────────

function SkippedRowsModal({
  open,
  title,
  uploadId,
  onClose,
}: {
  open: boolean;
  title: string;
  uploadId: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<SkippedRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !uploadId) {
      setRows(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from('import_errors')
      .select('row_number, error_message, raw_data')
      .eq('upload_id', uploadId)
      .eq('error_type', 'phone_not_in_leads')
      .order('row_number', { ascending: true })
      .then(({ data, error: qerr }) => {
        if (cancelled) return;
        if (qerr) {
          setError(qerr.message);
          setRows(null);
        } else {
          setRows(
            (data ?? []).map((r) => ({
              rowNumber: (r.row_number as number) ?? 0,
              errorMessage: (r.error_message as string) ?? '',
              rawData: (r.raw_data as Record<string, unknown>) ?? {},
            })),
          );
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, uploadId]);

  const downloadCsv = () => {
    if (!rows || rows.length === 0) return;
    const allKeys = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.rawData)) allKeys.add(k);
    }
    const headers = ['row_number', 'error_message', ...allKeys];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      const row = [
        r.rowNumber,
        r.errorMessage,
        ...[...allKeys].map((k) => r.rawData[k]),
      ].map(escape);
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_').toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">Error: {error}</p>}

        {rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No skipped rows.</p>
        )}

        {rows && rows.length > 0 && (
          <div className="border rounded-md overflow-auto max-h-[50vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Row</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Raw data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 tabular-nums">{r.rowNumber}</td>
                    <td className="px-3 py-1.5">{r.errorMessage}</td>
                    <td className="px-3 py-1.5 font-mono text-[10px] max-w-[400px] truncate">
                      {JSON.stringify(r.rawData)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={downloadCsv}
            disabled={!rows || rows.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RicochetParseErrorsModal ─────────────────────────────────────────────────

function RicochetParseErrorsModal({
  open,
  errors,
  onClose,
}: {
  open: boolean;
  errors: RicochetRowParseError[];
  onClose: () => void;
}) {
  const counts = errors.reduce<Record<string, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + 1;
    return acc;
  }, {});

  const downloadCsv = () => {
    if (errors.length === 0) return;
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['row_number,reason,detail'];
    for (const e of errors) {
      lines.push([e.rowNumber, e.reason, e.detail ?? ''].map(escape).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ricochet_parse_errors.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Beacon Lead List — Parse Errors</DialogTitle>
        </DialogHeader>

        {errors.length > 0 && (
          <div className="text-xs text-muted-foreground mb-2">
            Reasons:{' '}
            {Object.entries(counts)
              .map(([reason, n]) => `${reason} (${n})`)
              .join(', ')}
          </div>
        )}

        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No parse errors.</p>
        ) : (
          <div className="border rounded-md overflow-auto max-h-[50vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Row</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Detail</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 tabular-nums">{e.rowNumber}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{e.reason}</td>
                    <td className="px-3 py-1.5">{e.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={downloadCsv} disabled={errors.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
