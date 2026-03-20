import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REPORT_TYPES, DAILY_CALL_COLUMNS, DEER_DAMA_COLUMNS, DEFAULT_AGENCY } from '@/lib/constants';
import { SEED_AGENCIES } from '@/lib/seedData';

type Step = 'select' | 'preview' | 'mapping' | 'importing' | 'summary';

interface UploadState {
  file: File | null;
  reportType: string;
  agency: string;
  uploadDate: string;
  notes: string;
  columns: string[];
  previewRows: Record<string, string>[];
  step: Step;
}

export default function UploadCenter() {
  const [state, setState] = useState<UploadState>({
    file: null,
    reportType: '',
    agency: 'agency-1',
    uploadDate: new Date().toISOString().split('T')[0],
    notes: '',
    columns: [],
    previewRows: [],
    step: 'select',
  });

  const [dragOver, setDragOver] = useState(false);

  const detectReportType = (columns: string[]): string => {
    const colSet = new Set(columns.map(c => c.toLowerCase().trim()));
    const dailyMatch = DAILY_CALL_COLUMNS.filter(c => colSet.has(c.toLowerCase())).length;
    const deerMatch = DEER_DAMA_COLUMNS.filter(c => colSet.has(c.toLowerCase())).length;
    if (deerMatch > dailyMatch && deerMatch >= 5) return REPORT_TYPES.DEER_DAMA;
    if (dailyMatch >= 5) return REPORT_TYPES.DAILY_CALL;
    return '';
  };

  const handleFile = useCallback(async (file: File) => {
    // Parse CSV (simplified for now - full XLSX support via library)
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return;

    const columns = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const previewRows = lines.slice(1, 6).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      columns.forEach((col, i) => { row[col] = values[i] || ''; });
      return row;
    });

    const detectedType = detectReportType(columns);

    setState(prev => ({
      ...prev,
      file,
      columns,
      previewRows,
      reportType: detectedType || prev.reportType,
      step: 'preview',
    }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = () => {
    setState(prev => ({ ...prev, step: 'importing' }));
    // Simulate import
    setTimeout(() => setState(prev => ({ ...prev, step: 'summary' })), 2000);
  };

  const reset = () => setState({
    file: null, reportType: '', agency: 'agency-1',
    uploadDate: new Date().toISOString().split('T')[0],
    notes: '', columns: [], previewRows: [], step: 'select',
  });

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          Upload Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Import Daily Call Reports and Deer Dama Reports from Ricochet</p>
      </div>

      {/* Step: Select File */}
      {state.step === 'select' && (
        <div className="max-w-2xl">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Report Type</label>
              <select
                value={state.reportType}
                onChange={e => setState(prev => ({ ...prev, reportType: e.target.value }))}
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Auto-detect or select...</option>
                <option value={REPORT_TYPES.DAILY_CALL}>Daily Call Report</option>
                <option value={REPORT_TYPES.DEER_DAMA}>Deer Dama Report</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Agency</label>
              <select
                value={state.agency}
                onChange={e => setState(prev => ({ ...prev, agency: e.target.value }))}
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              >
                {SEED_AGENCIES.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Upload Date</label>
              <input
                type="date"
                value={state.uploadDate}
                onChange={e => setState(prev => ({ ...prev, uploadDate: e.target.value }))}
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Notes (optional)</label>
              <input
                type="text"
                value={state.notes}
                onChange={e => setState(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Morning batch"
                className="w-full bg-card border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
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
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button variant="outline" size="sm" asChild>
                <span>Browse Files</span>
              </Button>
            </label>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {state.step === 'preview' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">{state.file?.name}</p>
              <p className="text-xs text-muted-foreground">
                {state.columns.length} columns · {state.previewRows.length} preview rows ·
                {state.reportType === REPORT_TYPES.DAILY_CALL ? ' Daily Call Report' :
                 state.reportType === REPORT_TYPES.DEER_DAMA ? ' Deer Dama Report' : ' Unknown type'}
              </p>
            </div>
          </div>

          {state.reportType && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-success/10 rounded-md">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-sm text-success">
                Auto-detected as {state.reportType === REPORT_TYPES.DAILY_CALL ? 'Daily Call Report' : 'Deer Dama Report'}
              </span>
            </div>
          )}

          {!state.reportType && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-warning/10 rounded-md">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm text-warning-foreground">Could not auto-detect report type. Please select manually.</span>
            </div>
          )}

          {/* Column Preview Table */}
          <div className="border rounded-lg overflow-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {state.columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.previewRows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {state.columns.map(col => (
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
            <Button onClick={handleImport} disabled={!state.reportType}>
              Import {state.previewRows.length}+ Rows
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {state.step === 'importing' && (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-foreground">Importing and matching records...</p>
          <p className="text-xs text-muted-foreground mt-1">Normalizing phones, matching leads, deduplicating inbound calls</p>
        </div>
      )}

      {/* Step: Summary */}
      {state.step === 'summary' && (
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="w-8 h-8 text-success" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Import Complete</h2>
              <p className="text-sm text-muted-foreground">{state.file?.name}</p>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-5 space-y-3 mb-6">
            {[
              ['Rows Imported', '247'],
              ['Leads Matched (ID + Phone)', '189'],
              ['Leads Matched (Phone Only)', '38'],
              ['New Leads Created', '14'],
              ['Unmatched Rows', '6'],
              ['Duplicate Inbound Suppressed', '3'],
              ['Invalid Phone Numbers', '2'],
              ['Errors', '1'],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground tabular-nums">{val}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button onClick={reset}>Upload Another File</Button>
            <Button variant="outline">View Import Details</Button>
          </div>
        </div>
      )}

      {/* Recent Uploads */}
      {state.step === 'select' && (
        <div className="mt-8">
          <h3 className="section-title mb-4">Recent Uploads</h3>
          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">File</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Agency</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Rows</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { file: 'daily_calls_03-14.csv', type: 'Daily Call', agency: 'McBrayer Agency', date: 'Mar 14, 2025', rows: 312, status: 'Complete' },
                  { file: 'deer_dama_03-14.csv', type: 'Deer Dama', agency: 'McBrayer Agency', date: 'Mar 14, 2025', rows: 247, status: 'Complete' },
                  { file: 'daily_calls_03-13.csv', type: 'Daily Call', agency: 'McBrayer Agency', date: 'Mar 13, 2025', rows: 289, status: 'Complete' },
                  { file: 'daily_calls_03-13.csv', type: 'Daily Call', agency: 'Summit Insurance Group', date: 'Mar 13, 2025', rows: 198, status: 'Complete' },
                ].map((row, i) => (
                  <tr key={i} className="border-t hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.file}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.agency}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.date}</td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.rows}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">{row.status}</span>
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
