import { useState, useEffect, useRef } from 'react';
import { type LucideIcon, ChevronRight, X } from 'lucide-react';

interface BreakdownRow {
  label: string;
  newValue: string;
  reQuoteValue: string;
}

interface FlipKPICardProps {
  title: string;
  summaryValue: string;
  summaryLabel: string;
  icon: LucideIcon;
  color: string;
  breakdownRows: BreakdownRow[];
  className?: string;
}

export default function FlipKPICard({
  title,
  summaryValue,
  summaryLabel,
  icon: Icon,
  color,
  breakdownRows,
  className = '',
}: FlipKPICardProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogTitleId = `kpi-dialog-${title.replace(/\s+/g, '-').toLowerCase()}`;

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => closeButtonRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const trigger = triggerRef.current;
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Summary card — semantic button for full keyboard + screen reader support */}
      <button
        ref={triggerRef}
        className={`kpi-card animate-fade-in group text-left w-full ${className}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title}: ${summaryValue} ${summaryLabel}. Click to expand breakdown.`}
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
            style={{ backgroundColor: `${color}15`, color }}
            aria-hidden="true"
          >
            <Icon className="w-5 h-5" />
          </div>
          <span className="text-muted-foreground opacity-40 group-hover:opacity-70 transition-opacity" aria-hidden="true">
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>
        <div>
          <p className="stat-value" style={{ color }}>{summaryValue}</p>
          <p className="stat-label mt-1">{summaryLabel}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-2 font-medium">{title}</p>
      </button>

      {/* Drill-down modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" aria-hidden="true" />

          {/* Dialog */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="relative bg-card border rounded-xl shadow-xl w-full max-w-lg animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${color}15`, color }}
                  aria-hidden="true"
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 id={dialogTitleId} className="text-base font-semibold text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Combined: <span className="font-bold" style={{ color }}>{summaryValue}</span> {summaryLabel}
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="Close breakdown"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Breakdown table */}
            <div className="p-5">
              <div className="rounded-lg border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_100px_100px] bg-secondary/50 px-4 py-2.5 border-b">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metric</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-right text-primary">New Leads</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-right" style={{ color: 'hsl(var(--kpi-callbacks))' }}>Re-Quotes</span>
                </div>

                {/* Rows */}
                {breakdownRows.map((row, i) => (
                  <div
                    key={row.label}
                    className={`grid grid-cols-[1fr_100px_100px] px-4 py-3 items-center ${
                      i < breakdownRows.length - 1 ? 'border-b border-border/50' : ''
                    } ${i % 2 === 1 ? 'bg-secondary/20' : ''}`}
                  >
                    <span className="text-sm text-foreground">{row.label}</span>
                    <span className="text-sm font-bold tabular-nums text-right text-primary">{row.newValue}</span>
                    <span className="text-sm font-bold tabular-nums text-right" style={{ color: 'hsl(var(--kpi-callbacks))' }}>{row.reQuoteValue}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
