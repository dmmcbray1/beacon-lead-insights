import { useEffect, useState } from 'react';
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

const REVENUE_RATE_KEY = 'roi:revenueRatePct';
const DEFAULT_REVENUE_RATE_PCT = 25;

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
  const byProducer = data?.byProducer ?? [];
  const byDate = data?.byDate ?? [];

  const [revenueRatePct, setRevenueRatePct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(REVENUE_RATE_KEY);
      if (saved != null) {
        const parsed = parseFloat(saved);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_REVENUE_RATE_PCT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(REVENUE_RATE_KEY, String(revenueRatePct));
    } catch {
      /* ignore */
    }
  }, [revenueRatePct]);

  const revenueRate = (Number.isFinite(revenueRatePct) ? revenueRatePct : 0) / 100;
  const totalRevenue = (m?.totalPremium ?? 0) * revenueRate;
  const revenueRoiPct =
    m && m.totalLeadSpend > 0 ? (totalRevenue / m.totalLeadSpend) * 100 : 0;

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

      {/* ── Revenue rate input ────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="revenueRate" className="text-sm font-medium text-foreground">
          Revenue % of Premium:
        </label>
        <div className="relative">
          <input
            id="revenueRate"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={Number.isFinite(revenueRatePct) ? revenueRatePct : ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setRevenueRatePct(Number.isFinite(v) ? v : 0);
            }}
            className="h-9 w-24 rounded-md border border-input bg-background px-3 pr-7 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        </div>
        {revenueRatePct !== DEFAULT_REVENUE_RATE_PCT && (
          <button
            type="button"
            onClick={() => setRevenueRatePct(DEFAULT_REVENUE_RATE_PCT)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Reset to {DEFAULT_REVENUE_RATE_PCT}%
          </button>
        )}
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
          label="Revenue"
          value={m ? fmtCurrency(totalRevenue) : '—'}
          subLabel={`Premium × ${fmt(revenueRatePct, 1)}%`}
          icon={<DollarSign className="w-5 h-5" />}
          highlight
          loading={isLoading}
        />
        <MetricCard
          label="ROI"
          value={m ? fmtPct(revenueRoiPct, 1) : '—'}
          subLabel="(Revenue / Lead Spend) × 100"
          icon={<Percent className="w-5 h-5" />}
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
      <Card className="mb-6">
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
                  <TableHead className="text-right">Est. Revenue</TableHead>
                  <TableHead className="text-right">Cost / Lead</TableHead>
                  <TableHead className="text-right">Cost / Sold</TableHead>
                  <TableHead className="text-right">ROI %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!isLoading && byCampaign.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      No campaign data for selected period
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && byCampaign.map((row) => {
                  const campRevenue = row.premium * revenueRate;
                  const campRoiPct = row.spend > 0 ? (campRevenue / row.spend) * 100 : 0;
                  return (
                    <TableRow key={row.campaign}>
                      <TableCell className="font-medium max-w-[200px] truncate">{row.campaign}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.leads)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.contacted)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.quoted)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.sold)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.premium)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(campRevenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.costPerLead)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.sold > 0 ? fmtCurrency(row.costPerSold) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={
                            campRoiPct > 100
                              ? 'text-success font-semibold'
                              : campRoiPct > 50
                              ? 'text-foreground'
                              : 'text-warning'
                          }
                        >
                          {row.spend > 0 ? fmtPct(campRoiPct) : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Revenue by Producer ──────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Revenue by Producer</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producer</TableHead>
                  <TableHead className="text-right">Households</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Policies</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg Rev / HH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!isLoading && byProducer.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No producer data for selected period
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && byProducer.map((row) => {
                  const prodRevenue = row.premium * revenueRate;
                  const avgRev = row.households > 0 ? prodRevenue / row.households : 0;
                  return (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.households)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.items)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.policies)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.premium)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtCurrency(prodRevenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(avgRev)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Revenue by Date ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Revenue by Date</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[560px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale Date</TableHead>
                  <TableHead className="text-right">Households</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Policies</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!isLoading && byDate.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No sales for selected period
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && byDate.map((row) => {
                  const dayRevenue = row.premium * revenueRate;
                  return (
                    <TableRow key={row.date}>
                      <TableCell className="font-medium tabular-nums">{row.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.households)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.items)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.policies)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.premium)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtCurrency(dayRevenue)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
