import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { REPORT_TYPES, DAILY_CALL_COLUMNS, DEER_DAMA_COLUMNS } from '@/lib/constants';
import { importDailyCallReport, importDeerDamaReport, parseFile, type ImportProgress, type ImportResult } from '@/lib/importService';
import { useUploadHistory } from '@/hooks/useLeadData';
import { useAuth } from '@/hooks/useAuth';

type Step = 'select' | 'preview' | 'importing' | 'summary';

interface UploadState {
  file: File | null;
  reportType: string;
  uploadDate: string;
  notes: string;
  columns: string[];
  previewRows: Record<string, string>[];
  step: Step;
  progress: ImportProgress | null;
  result: ImportResult | null;
}

const initialState: UploadState = {
  file: null,
  reportType: '',
  uploadDate: new Date().toISOString().split('T')[0],
  notes: '',
  columns: [],
  previewRows: [],
  step: 'select',
  progress: null,
  result: null,
};

function detectReportType(columns: string[]): string {
  const colSet = new Set(columns.map((c) => c.toLowerCase().trim()));
  const dailyMatch = DAILY_CALL_COLUMNS.filter((c) => colSet.has(c.toLowerCase())).length;
  const deerMatch = DEER_DAMA_COLUMNS.filter((c) => colSet.has(c.toLowerCase())).length;
  if (deerMatch > dailyMatch && deerMatch >= 5) return REPORT_TYPES.DEER_DAMA;
  if (dailyMatch >= 5) return REPORT_TYPES.DAILY_CALL;
  return '';
}

export default function UploadCenter() {
  const { agencyId } = useAuth();
  const queryClient = useQueryClient();
  const uploadHistory = useUploadHistory();

  const [state, setState] = useState<UploadState>(initialState);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    try {
      const rows = await parseFile(file);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const previewRows = rows.slice(0, 5).map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])),
      ) as Record<string, string>[];
      const detectedType = detectReportType(columns);
      setState((prev) => ({
        ...prev,
        file,
        columns,
        previewRows,
        reportType: detectedType || prev.reportType,
        step: 'preview',
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        result: {
          uploadId: '', rowsTotal: 0, rowsImported: 0, rowsFiltered: 0,
          rowsSkipped: 0, newLeads: 0, updatedLeads: 0,
          errors: ['Could not read file: ' + String(err)],
        },
        step: 'summary',
      }));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    if (!state.file || !state.reportType || !agencyId) return;

    setState((prev) => ({ ...prev, step: 'importing', progress: null }));

    const onProgress = (p: ImportProgress) => {
      setState((prev) => ({ ...prev, progress: p }));
    };

    const fn =
      state.reportType === REPORT_TYPES.DAILY_CALL
        ? importDailyCallReport
        : importDeerDamaReport;

    const result = await fn(state.file, agencyId, state.uploadDate, state.notes, onProgress);

    // Invalidate all lead-related queries so dashboards refresh
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
    await queryClient.invalidateQueries({ queryKey: ['staffPerf'] });
    await queryClient.invalidateQueries({ queryKey: ['uploads'] });
    await queryClient.invalidateQueries({ queryKey: ['leadList'] });

    setState((prev) => ({ ...prev, step: 'summary', result }));
  };

  const reset = () => setState(initialState);

  const reportLabel = (type: string) =>
    type === REPORT_TYPES.DAILY_CALL ? 'Daily Call Report' : type === REPORT_TYPES.DEER_DAMA ? 'Deer Dama (Lead) Report' : 'Unknown';

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

      {/* ── Step: Select File ─────────────────────────────────────────────── */}
      {state.step === 'select' && (
        <div className="max-w-2xl">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Report Type</label>
              <select
                value={state.reportType}
                onChange={(e) => setState((prev) => ({ ...prev, reportType: e.target.value }))}
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Auto-detect or select…</option>
                <option value={REPORT_TYPES.DAILY_CALL}>Daily Call Report</option>
                <option value={REPORT_TYPES.DEER_DAMA}>Deer Dama (Lead) Report</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Upload Date</label>
              <input
                type="date"
                value={state.uploadDate}
                onChange={(e) => setState((prev) => ({ ...prev, uploadDate: e.target.value }))}
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-foreground mb-1.5 block">Notes (optional)</label>
              <input
                type="text"
                value={state.notes}
                onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Morning batch, Mar 24"
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors duration-200 ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            }`}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground mb-1">Drop your CSV or Excel file here</p>
            <p className="text-xs text-muted-foreground mb-4">Supports .csv, .xlsx, .xls</p>
            <label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button variant="outline" size="sm" asChild><span>Browse Files</span></Button>
            </label>
          </div>
        </div>
      )}

      {/* ── Step: Preview ─────────────────────────────────────────────────── */}
      {state.step === 'preview' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">{state.file?.name}</p>
              <p className="text-xs text-muted-foreground">
                {state.columns.length} columns · {state.previewRows.length} preview rows
                {state.reportType ? ` · ${reportLabel(state.reportType)}` : ''}
              </p>
            </div>
          </div>

          {state.reportType ? (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-success/10 rounded-md">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-sm text-success">Auto-detected as {reportLabel(state.reportType)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-warning/10 rounded-md">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm text-warning-foreground">Could not auto-detect — please select the report type above.</span>
            </div>
          )}

          {!agencyId && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-destructive/10 rounded-md">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">No agency assigned to your account. Contact your administrator.</span>
            </div>
          )}

          <div className="border rounded-lg overflow-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {state.columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.previewRows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {state.columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[200px] truncate">
                        {row[col] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={handleImport} disabled={!state.reportType || !agencyId}>
              Import File
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Importing ───────────────────────────────────────────────── */}
      {state.step === 'importing' && (
        <div className="max-w-md mx-auto text-center py-16">
          <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
          <p className="text-sm font-medium text-foreground">
            {state.progress?.phase ?? 'Preparing import…'}
          </p>
          {state.progress && state.progress.total > 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-1">
                {state.progress.processed} / {state.progress.total} rows
              </p>
              <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden max-w-xs mx-auto">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (state.progress.processed / state.progress.total) * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step: Summary ─────────────────────────────────────────────────── */}
      {state.step === 'summary' && state.result && (
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            {state.result.errors.length === 0 ? (
              <CheckCircle2 className="w-8 h-8 text-success" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-warning" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-foreground">Import Complete</h2>
              <p className="text-sm text-muted-foreground">{state.file?.name}</p>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-5 space-y-3 mb-6">
            {[
              ['Total Rows in File', state.result.rowsTotal],
              ['Rows Imported', state.result.rowsImported],
              ['Rows Filtered (non-Beacon Territory)', state.result.rowsFiltered],
              ['Rows Skipped (invalid phone / errors)', state.result.rowsSkipped],
              ['New Leads Created', state.result.newLeads],
              ['Existing Leads Updated', state.result.updatedLeads],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground tabular-nums">{val}</span>
              </div>
            ))}
          </div>

          {state.result.errors.length > 0 && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-destructive mb-2">
                {state.result.errors.length} error(s)
              </p>
              <ul className="space-y-1">
                {state.result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={reset}>Upload Another File</Button>
          </div>
        </div>
      )}

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
                  </tr>
                ))}
                {!uploadHistory.isLoading && (uploadHistory.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No uploads yet</td></tr>
                )}
                {(uploadHistory.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">{row.file_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {row.report_type === REPORT_TYPES.DAILY_CALL ? 'Daily Call' : 'Deer Dama'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.upload_date}</td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.row_count ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.matched_count ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        row.status === 'complete' ? 'bg-success/10 text-success' :
                        row.status === 'complete_with_errors' ? 'bg-warning/10 text-warning' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {row.status === 'complete_with_errors' ? 'Errors' : row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
