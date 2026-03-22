import { useState } from 'react';
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

  return (
    <>
      {/* Summary card */}
      <div
        className={`kpi-card animate-fade-in cursor-pointer group ${className}`}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <Icon className="w-5 h-5" />
          </div>
          <span className="text-muted-foreground opacity-40 group-hover:opacity-70 transition-opacity">
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>
        <div>
          <p className="stat-value" style={{ color }}>{summaryValue}</p>
          <p className="stat-label mt-1">{summaryLabel}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-2 font-medium">{title}</p>
      </div>

      {/* Drill-down modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />

          {/* Dialog */}
          <div
            className="relative bg-card border rounded-xl shadow-xl w-full max-w-lg animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${color}15`, color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Combined: <span className="font-bold" style={{ color }}>{summaryValue}</span> {summaryLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
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
