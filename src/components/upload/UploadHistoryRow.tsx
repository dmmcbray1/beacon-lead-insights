import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
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
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { deleteBatch, deleteUpload } from '@/lib/importService';
import { REPORT_TYPES } from '@/lib/constants';

export interface UploadRow {
  id: string;
  file_name: string;
  report_type: string;
  upload_date: string;
  row_count: number | null;
  matched_count: number | null;
  status: string;
  batch_id: string | null;
}

interface Props {
  batchId: string | null;
  rows: UploadRow[];
  isAdmin: boolean;
}

export default function UploadHistoryRow({ batchId, rows, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (batchId) {
        await deleteBatch(batchId);
      } else {
        await deleteUpload(rows[0].id);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['uploads'] }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['leadList'] }),
        queryClient.invalidateQueries({ queryKey: ['staffPerf'] }),
      ]);
      toast.success(batchId ? 'Upload batch deleted.' : 'Upload deleted.');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const combinedRowCount = rows.reduce((sum, r) => sum + (r.row_count ?? 0), 0);
  const combinedMatched = rows.reduce((sum, r) => sum + (r.matched_count ?? 0), 0);

  return (
    <>
      {rows.map((row, idx) => (
        <tr
          key={row.id}
          className={`border-t hover:bg-muted/50 transition-colors ${
            batchId ? 'border-l-2 border-l-primary/40' : ''
          }`}
        >
          <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">{row.file_name}</td>
          <td className="px-4 py-2.5 text-muted-foreground">
            {row.report_type === REPORT_TYPES.DAILY_CALL ? 'Daily Call' : 'Deer Dama'}
          </td>
          <td className="px-4 py-2.5 text-muted-foreground">{row.upload_date}</td>
          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.row_count ?? '—'}</td>
          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.matched_count ?? '—'}</td>
          <td className="px-4 py-2.5">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                row.status === 'complete'
                  ? 'bg-success/10 text-success'
                  : row.status === 'complete_with_errors'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {row.status === 'complete_with_errors' ? 'Errors' : row.status}
            </span>
          </td>
          <td className="px-4 py-2.5 text-right">
            {isAdmin && idx === 0 ? (
              <button
                onClick={() => setOpen(true)}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                aria-label={batchId ? 'Delete upload batch' : 'Delete upload'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : null}
          </td>
        </tr>
      ))}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchId ? 'Delete this upload batch?' : 'Delete this upload?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <ul className="text-sm space-y-1">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <strong>{r.file_name}</strong> — {r.upload_date} ({r.row_count ?? 0} rows)
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-medium">
                  Total rows affected: {combinedRowCount} ({combinedMatched} matched).
                </p>
                <p className="text-sm text-destructive">
                  All stats derived from {batchId ? 'these files' : 'this file'} will be removed.
                  This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
