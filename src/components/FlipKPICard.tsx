import { useState } from 'react';
import { type LucideIcon, RotateCcw } from 'lucide-react';

interface SubMetric {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
}

interface FlipKPICardProps {
  title: string;
  summaryValue: string;
  summaryLabel: string;
  icon: LucideIcon;
  color: string;
  subMetrics: SubMetric[];
  className?: string;
}

export default function FlipKPICard({
  title,
  summaryValue,
  summaryLabel,
  icon: Icon,
  color,
  subMetrics,
  className = '',
}: FlipKPICardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={`relative cursor-pointer ${className}`}
      style={{ perspective: '1000px', minHeight: '180px' }}
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
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              Click to flip
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
            </span>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto">
            {subMetrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <m.icon className="w-3.5 h-3.5 shrink-0" style={{ color: m.color }} />
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: m.color }}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
