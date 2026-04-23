import { useCallback, useState } from 'react';
import { FileSpreadsheet, Upload, X, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseFile } from '@/lib/importService';
import {
  DAILY_CALL_COLUMNS,
  DEER_DAMA_COLUMNS,
  RICOCHET_COLUMNS,
  REPORT_TYPES,
} from '@/lib/constants';

export interface BatchDropSlotValue {
  file: File;
  columns: string[];
  previewRows: Record<string, string>[];
  detectedType: string;
  typeMatches: boolean;
}

interface Props {
  expectedType: typeof REPORT_TYPES.DAILY_CALL | typeof REPORT_TYPES.DEER_DAMA | typeof REPORT_TYPES.RICOCHET_LEAD_LIST;
  disabled?: boolean;
  disabledHelperText?: string;
  label: string;
  value: BatchDropSlotValue | null;
  onChange: (value: BatchDropSlotValue | null) => void;
  onError?: (message: string) => void;
}

function detectReportType(columns: string[]): string {
  const lowered = columns.map((c) => c.toLowerCase());
  const dailyMatch = lowered.filter((c) => DAILY_CALL_COLUMNS.includes(c as any)).length;
  const deerMatch  = lowered.filter((c) => DEER_DAMA_COLUMNS.includes(c as any)).length;
  const ricoMatch  = lowered.filter((c) => RICOCHET_COLUMNS.includes(c as any)).length;

  // Pick the highest-scoring type that also meets the ≥5 threshold.
  // Ties broken in favor of Ricochet, then Deer Dama, then Daily Call
  // (Ricochet has the most unique columns, so a real Ricochet file will
  // always out-score the other types).
  const scores: Array<[number, string]> = [
    [ricoMatch, REPORT_TYPES.RICOCHET_LEAD_LIST],
    [deerMatch, REPORT_TYPES.DEER_DAMA],
    [dailyMatch, REPORT_TYPES.DAILY_CALL],
  ];
  const [topScore, topType] = scores.reduce((best, cur) =>
    cur[0] > best[0] ? cur : best
  );
  return topScore >= 5 ? topType : '';
}

export default function BatchDropSlot({ expectedType, label, value, onChange, onError, disabled, disabledHelperText }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const rows = await parseFile(file);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const previewRows = rows.slice(0, 5).map((r) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])),
        ) as Record<string, string>[];
        const detectedType = detectReportType(columns);
        onChange({
          file,
          columns,
          previewRows,
          detectedType,
          typeMatches: detectedType === expectedType,
        });
      } catch (err) {
        onError?.('Could not read file: ' + String(err));
      }
    },
    [expectedType, onChange, onError],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  if (value) {
    return (
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                {value.file.name}
              </p>
            </div>
          </div>
          <button
            onClick={() => onChange(null)}
            className="p-1 rounded hover:bg-muted"
            aria-label="Remove file"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {value.typeMatches ? (
          <div className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Detected as {label}
          </div>
        ) : (
          <div className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              This looks like a different report type. Remove it and drop it into the other slot.
            </span>
          </div>
        )}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted bg-muted/30 p-8 text-center opacity-60">
        <Lock className="h-6 w-6 text-muted-foreground mb-2" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {disabledHelperText ?? 'Upload the previous step first.'}
        </p>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      <p className="text-xs text-muted-foreground mb-3">Drop CSV or Excel file here</p>
      <label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            if (disabled) return;
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button variant="outline" size="sm" asChild>
          <span>Browse</span>
        </Button>
      </label>
    </div>
  );
}
