import { useState } from 'react';
import { formatPercent } from '@/lib/metrics';
import FilterBar from '@/components/FilterBar';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffPerformance, type Filters } from '@/hooks/useLeadData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function StaffPerformance() {
  const [filters, setFilters] = useState<Filters>({
    dateRange: '30d',
    agency: 'all',
    staff: 'all',
    leadType: 'all',
    dateBasis: 'call_date',
    customFrom: undefined,
    customTo: undefined,
  });

  const { data: staffData, isLoading, error } = useStaffPerformance(filters);

  const chartData = (staffData ?? []).map((s) => ({
    name: (() => { const parts = s.name.split(' '); return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0]; })(),
    contacts: s.contacts,
    quoted: s.quoted,
    callbacks: s.callbacks,
    voicemails: s.voicemails,
  }));

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          Staff Performance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Individual agent metrics and comparisons</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {isLoading && (
        <div className="space-y-4">
          <div className="bg-card border rounded-lg p-5">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-[260px] w-full rounded-md" />
          </div>
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="p-3 bg-muted flex gap-4">
              {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-4 w-16" />)}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-3 py-2.5 border-t">
                {Array.from({ length: 12 }).map((_, j) => <Skeleton key={j} className="h-4 w-12" />)}
              </div>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="py-4 px-4 bg-destructive/10 text-destructive text-sm rounded-lg mb-4">
          Failed to load data: {(error as Error).message}
        </div>
      )}

      {!isLoading && (!staffData || staffData.length === 0) && !error && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-base font-medium mb-1">No staff data yet</p>
          <p className="text-sm">Upload a Daily Call Report to see per-agent metrics.</p>
        </div>
      )}

      {!isLoading && staffData && staffData.length > 0 && (
        <>
          {/* Chart */}
          <div className="bg-card border rounded-lg p-5 mb-6">
            <h3 className="section-title mb-4">Staff Comparison</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: 'hsl(var(--card-foreground))',
                  }}
                />
                <Bar dataKey="contacts" fill="hsl(var(--kpi-contacts))" radius={[3, 3, 0, 0]} name="Contacts" />
                <Bar dataKey="quoted" fill="hsl(var(--kpi-quotes))" radius={[3, 3, 0, 0]} name="Quoted" />
                <Bar dataKey="callbacks" fill="hsl(var(--kpi-callbacks))" radius={[3, 3, 0, 0]} name="Callbacks" />
                <Bar dataKey="voicemails" fill="hsl(var(--kpi-voicemails))" radius={[3, 3, 0, 0]} name="Voicemails" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="bg-card border rounded-lg overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {[
                    'Staff', 'Leads', 'Contacts', 'Callbacks', 'Voicemails', 'VM/Lead',
                    'Quoted', 'Contact %', 'Quote %', 'C→Q %', 'CB→Q %', 'Bad Phone %',
                  ].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffData.map((s) => (
                  <tr key={s.staffId} className="border-t hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{s.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.leads}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.contacts}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.callbacks}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.voicemails}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.voicemailRate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.quoted}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.contactRate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.quoteRate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.contactToQuoteRate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.callbackToQuoteRate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.badPhoneRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
