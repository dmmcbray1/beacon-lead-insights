import { useState } from 'react';
import FilterBar from '@/components/FilterBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useROIData } from '@/hooks/useLeadData';
import type { Filters } from '@/hooks/useLeadData';
import { DollarSign, TrendingUp, Users, PhoneCall, ShoppingBag, BarChart3, Percent } from 'lucide-react';

const defaultFilters: Filters = {
  dateRange: 'all',
  agency: 'all',
  staff: 'all',
  leadType: 'all',
  dateBasis: 'lead_date',
  customFrom: undefined,
  customTo: undefined,
};

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number, decimals = 1): string {
  return n.toFixed(decimals) + '%';
}

interface MetricCardProps {
  label: string;
  value: string;
  subLabel?: string;
  icon: React.ReactNode;
  highlight?: boolean;
  loading?: boolean;
}

function MetricCard({ label, value, subLabel, icon, highlight, loading }: MetricCardProps) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : undefined}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium mb-1 leading-tight">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-28 mt-1" />
            ) : (
              <p
                className={`text-2xl font-bold tabular-nums ${
                  highlight ? 'text-primary' : 'text-foreground'
                }`}
              >
                {value}
              </p>
            )}
            {subLabel && !loading && (
              <p className="text-xs text-muted-foreground mt-0.5">{subLabel}</p>
            )}
          </div>
          <span className={`mt-0.5 ml-2 ${highlight ? 'text-primary' : 'text-muted-foreground'}`}>
            {icon}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ROITracking() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const { data, isLoading, error } = useROIData(filters);

  const m = data?.metrics;
  const byCampaign = data?.byCampaign ?? [];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          ROI Tracking
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lead spend vs. premium revenue — return on investment analysis
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error instanceof Error ? error.message : (error as {message?: string})?.message ?? JSON.stringify(error)}
        </div>
      )}

      <div className="mb-6">
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {/* ── ROI Metrics Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {/* Column 1 */}
        <MetricCard
          label="Total Lead Spend"
          value={m ? fmtCurrency(m.totalLeadSpend) : '—'}
          icon={<DollarSign className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="Total Premium"
          value={m ? fmtCurrency(m.totalPremium) : '—'}
          subLabel="from Sales Log imports"
          icon={<TrendingUp className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="ROI"
          value={m ? fmtPct(m.roiPct, 1) : '—'}
          subLabel="(Premium / Lead Spend) × 100"
          icon={<Percent className="w-5 h-5" />}
          highlight
          loading={isLoading}
        />

        {/* Column 2 */}
        <MetricCard
          label="Cost per Lead"
          value={m ? fmtCurrency(m.costPerLead) : '—'}
          subLabel={m ? `${fmt(m.totalLeads)} total leads` : undefined}
          icon={<Users className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="Cost per Conversation"
          value={m ? fmtCurrency(m.costPerConversation) : '—'}
          subLabel={m ? `${fmt(m.totalContactedLeads)} contacts` : undefined}
          icon={<PhoneCall className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="Cost per Quoted HH"
          value={m ? fmtCurrency(m.costPerQuotedHousehold) : '—'}
          subLabel={m ? `${fmt(m.totalQuotedHouseholds)} quoted` : undefined}
          icon={<BarChart3 className="w-5 h-5" />}
          loading={isLoading}
        />

        {/* Column 3 */}
        <MetricCard
          label="Cost per Sold Household"
          value={m ? fmtCurrency(m.costPerSoldHousehold) : '—'}
          subLabel={m ? `${fmt(m.totalHouseholdsSold)} sold` : undefined}
          icon={<DollarSign className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="Avg Items per Sold HH"
          value={m ? fmt(m.avgItemsPerSoldHousehold, 2) : '—'}
          icon={<ShoppingBag className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="Avg Policies per Sold HH"
          value={m ? fmt(m.avgPoliciesPerSoldHousehold, 2) : '—'}
          icon={<ShoppingBag className="w-5 h-5" />}
          loading={isLoading}
        />

        <MetricCard
          label="Home + Auto %"
          value={m ? fmtPct(m.pctHomeAndAuto) : '—'}
          subLabel="Households with both policy types"
          icon={<Percent className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="Total Leads"
          value={m ? fmt(m.totalLeads) : '—'}
          icon={<Users className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          label="Households Sold"
          value={m ? fmt(m.totalHouseholdsSold) : '—'}
          icon={<TrendingUp className="w-5 h-5" />}
          loading={isLoading}
        />
      </div>

      {/* ── ROI by Campaign ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ROI by Campaign</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Contacted</TableHead>
                  <TableHead className="text-right">Quoted</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Est. Premium</TableHead>
                  <TableHead className="text-right">Cost / Lead</TableHead>
                  <TableHead className="text-right">Cost / Sold</TableHead>
                  <TableHead className="text-right">ROI %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!isLoading && byCampaign.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No campaign data for selected period
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && byCampaign.map((row) => (
                  <TableRow key={row.campaign}>
                    <TableCell className="font-medium max-w-[200px] truncate">{row.campaign}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(row.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtCurrency(row.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(row.contacted)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(row.quoted)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(row.sold)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtCurrency(row.premium)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtCurrency(row.costPerLead)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.sold > 0 ? fmtCurrency(row.costPerSold) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          row.roiPct > 300
                            ? 'text-success font-semibold'
                            : row.roiPct > 100
                            ? 'text-foreground'
                            : 'text-warning'
                        }
                      >
                        {row.spend > 0 ? fmtPct(row.roiPct) : '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
