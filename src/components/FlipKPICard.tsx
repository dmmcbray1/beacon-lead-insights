import { useState } from 'react';
import { type LucideIcon, RotateCcw } from 'lucide-react';

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
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={`relative cursor-pointer ${className}`}
      style={{ perspective: '1000px', minHeight: '200px' }}
      onClick={() => setFlipped(!flipped)}
    >
      <div
        className="w-full h-full transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 kpi-card flex flex-col justify-between"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}15`, color }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1 opacity-60">
              <RotateCcw className="w-3 h-3" />
            </span>
          </div>
          <div>
            <p className="stat-value" style={{ color }}>{summaryValue}</p>
            <p className="stat-label mt-1">{summaryLabel}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-2 font-medium">{title}</p>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 kpi-card flex flex-col"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <span className="text-xs text-muted-foreground opacity-60">
              <RotateCcw className="w-3 h-3" />
            </span>
          </div>

          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 mb-1.5 pb-1.5 border-b border-border">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Metric</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary min-w-[48px] text-right">New</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider min-w-[48px] text-right" style={{ color: 'hsl(var(--kpi-callbacks))' }}>Re-Qt</span>
          </div>

          {/* Data rows */}
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {breakdownRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
                <span className="text-xs text-muted-foreground truncate">{row.label}</span>
                <span className="text-xs font-bold tabular-nums text-primary min-w-[48px] text-right">{row.newValue}</span>
                <span className="text-xs font-bold tabular-nums min-w-[48px] text-right" style={{ color: 'hsl(var(--kpi-callbacks))' }}>{row.reQuoteValue}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
