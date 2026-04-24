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
import { useSalesData } from '@/hooks/useLeadData';
import type { Filters } from '@/hooks/useLeadData';
import { DollarSign, ShoppingBag, Users, FileText, TrendingUp } from 'lucide-react';

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
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return n.toFixed(1) + '%';
}

interface KPICardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function KPICard({ label, value, icon, loading }: KPICardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SalesTracking() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const { data, isLoading, error } = useSalesData(filters);

  const kpis = data?.kpis;
  const byProducer = data?.byProducer ?? [];
  const byPolicyType = data?.byPolicyType ?? [];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          Sales Tracking
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Household-level sales performance from Sales Log imports
        </p>
      </div>
      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      <div className="mb-6">
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-8">
        <KPICard
          label="Households Sold"
          value={kpis ? fmt(kpis.totalHouseholds) : '—'}
          icon={<Users className="w-4 h-4" />}
          loading={isLoading}
        />
        <KPICard
          label="Total Items Sold"
          value={kpis ? fmt(kpis.totalItems) : '—'}
          icon={<ShoppingBag className="w-4 h-4" />}
          loading={isLoading}
        />
        <KPICard
          label="Total Policies"
          value={kpis ? fmt(kpis.totalPolicies) : '—'}
          icon={<FileText className="w-4 h-4" />}
          loading={isLoading}
        />
        <KPICard
          label="Total Premium"
          value={kpis ? fmtCurrency(kpis.totalPremium) : '—'}
          icon={<DollarSign className="w-4 h-4" />}
          loading={isLoading}
        />
        <KPICard
          label="Avg Items / HH"
          value={kpis ? fmt(kpis.avgItemsPerHousehold, 2) : '—'}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={isLoading}
        />
        <KPICard
          label="Avg Policies / HH"
          value={kpis ? fmt(kpis.avgPoliciesPerHousehold, 2) : '—'}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={isLoading}
        />
        <KPICard
          label="Home + Auto %"
          value={kpis ? fmtPct(kpis.pctHomeAndAuto) : '—'}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* ── Sales by Producer ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sales by Producer</CardTitle>
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
                    <TableHead className="text-right">Avg Premium/HH</TableHead>
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
                  {!isLoading && byProducer.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No sales data for selected period
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && byProducer.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.households)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.items)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.policies)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.premium)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.avgPremiumPerHousehold)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ── Sales by Policy Type ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sales by Policy Type</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy Type</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total Items</TableHead>
                    <TableHead className="text-right">Total Premium</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!isLoading && byPolicyType.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No sales data for selected period
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && byPolicyType.map((row) => (
                    <TableRow key={row.policyType}>
                      <TableCell className="font-medium">{row.policyType}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.count)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(row.totalItems)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrency(row.totalPremium)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
