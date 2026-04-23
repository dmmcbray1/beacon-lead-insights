import { useCallback, useState } from 'react';
import { FileSpreadsheet, Upload, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseFile } from '@/lib/importService';
import { REPORT_TYPES, DAILY_CALL_COLUMNS, DEER_DAMA_COLUMNS } from '@/lib/constants';

export interface BatchDropSlotValue {
  file: File;
  columns: string[];
  previewRows: Record<string, string>[];
  detectedType: string;
  typeMatches: boolean;
}

interface Props {
  expectedType: typeof REPORT_TYPES.DAILY_CALL | typeof REPORT_TYPES.DEER_DAMA;
  label: string;
  value: BatchDropSlotValue | null;
  onChange: (value: BatchDropSlotValue | null) => void;
  onError?: (message: string) => void;
}

function detectReportType(columns: string[]): string {
  const colSet = new Set(columns.map((c) => c.toLowerCase().trim()));
  const dailyMatch = DAILY_CALL_COLUMNS.filter((c) => colSet.has(c.toLowerCase())).length;
  const deerMatch = DEER_DAMA_COLUMNS.filter((c) => colSet.has(c.toLowerCase())).length;
  if (deerMatch > dailyMatch && deerMatch >= 5) return REPORT_TYPES.DEER_DAMA;
  if (dailyMatch >= 5) return REPORT_TYPES.DAILY_CALL;
  return '';
}

export default function BatchDropSlot({ expectedType, label, value, onChange, onError }: Props) {
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
