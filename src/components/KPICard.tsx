import { type LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
  subtitle?: string;
  trend?: { value: string; positive: boolean };
}

export default function KPICard({ label, value, icon: Icon, color, subtitle, trend }: KPICardProps) {
  return (
    <div className="kpi-card animate-fade-in cursor-pointer group">
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
          style={{ backgroundColor: `${color}15`, color }}
        >
          <Icon className="w-[18px] h-[18px]" />
        </div>
        {trend && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            trend.positive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          }`}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <p className="stat-value" style={{ color }}>{value}</p>
      <p className="stat-label mt-1">{label}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}
