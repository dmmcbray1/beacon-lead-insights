import { useState } from 'react';
import {
  Layers, Activity, Target, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import FlipKPICard from '@/components/FlipKPICard';
import FilterBar from '@/components/FilterBar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent, formatNumber } from '@/lib/metrics';
import { useKPIs, useContactTiming, useCallQuality, useDailyTrends, type Filters } from '@/hooks/useLeadData';

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    dateRange: '30d',
    agency: 'all',
    staff: 'all',
    leadType: 'all',
    dateBasis: 'lead_created',
    vendorFilter: true,
  });

  const { kpis, isLoading, error } = useKPIs(filters);
  const { timing } = useContactTiming(filters);
  const { data: callQuality } = useCallQuality(filters);
  const { data: dailyTrends } = useDailyTrends(filters);

  const nb = kpis?.newBreakdown;
  const rb = kpis?.reQuoteBreakdown;

  function fmtDuration(seconds: number): string {
    if (seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const groupedCards = kpis && nb && rb ? [
    {
      title: 'Lead Volume',
      summaryValue: formatNumber(kpis.totalLeads),
      summaryLabel: 'Total Leads',
      icon: Layers,
      color: 'hsl(var(--kpi-leads))',
      breakdownRows: [
        { label: 'Total Leads', newValue: formatNumber(nb.leads), reQuoteValue: formatNumber(rb.leads) },
      ],
    },
    {
      title: 'Contacts & Callbacks',
      summaryValue: formatPercent(kpis.contactRate),
      summaryLabel: 'Contact Rate',
      icon: Activity,
      color: 'hsl(var(--kpi-contacts))',
      breakdownRows: [
        { label: 'Contacts', newValue: formatNumber(nb.contacts), reQuoteValue: formatNumber(rb.contacts) },
        { label: 'Contact Rate', newValue: formatPercent(nb.contactRate), reQuoteValue: formatPercent(rb.contactRate) },
        { label: 'No-Contact (called)', newValue: formatNumber(nb.noContactCount), reQuoteValue: formatNumber(rb.noContactCount) },
        { label: 'No-Contact Rate', newValue: formatPercent(nb.noContactRate), reQuoteValue: formatPercent(rb.noContactRate) },
        { label: 'Avg Dials to Contact', newValue: (callQuality?.avgDialsBeforeContact ?? 0).toFixed(1), reQuoteValue: '—' },
        { label: 'Avg Contact Duration', newValue: fmtDuration(callQuality?.avgContactCallDurationSec ?? 0), reQuoteValue: '—' },
        { label: 'Voicemails Left', newValue: formatNumber(nb.voicemailLeads), reQuoteValue: formatNumber(rb.voicemailLeads) },
        { label: 'Voicemail Rate', newValue: formatPercent(nb.voicemailRate), reQuoteValue: formatPercent(rb.voicemailRate) },
        { label: '% of Outbound Calls', newValue: formatPercent(callQuality?.voicemailCallRate ?? 0), reQuoteValue: '—' },
        { label: 'Calls > 5 Min', newValue: formatNumber(callQuality?.callsOver5Min ?? 0), reQuoteValue: '—' },
        { label: '% Calls > 5 Min', newValue: formatPercent(callQuality?.callsOver5MinRate ?? 0), reQuoteValue: '—' },
        { label: 'Callbacks', newValue: formatNumber(nb.callbacks), reQuoteValue: formatNumber(rb.callbacks) },
        { label: 'CB w/ Voicemail', newValue: formatNumber(nb.voicemailCallbacks), reQuoteValue: formatNumber(rb.voicemailCallbacks) },
        { label: 'CB w/o Voicemail', newValue: formatNumber(nb.nonVoicemailCallbacks), reQuoteValue: formatNumber(rb.nonVoicemailCallbacks) },
        { label: 'VM CB → Quote %', newValue: formatPercent(nb.voicemailCallbackToQuoteRate), reQuoteValue: formatPercent(rb.voicemailCallbackToQuoteRate) },
        { label: 'Non-VM CB → Quote %', newValue: formatPercent(nb.nonVoicemailCallbackToQuoteRate), reQuoteValue: formatPercent(rb.nonVoicemailCallbackToQuoteRate) },
        { label: 'CB → Quoted', newValue: formatNumber(nb.callbacksQuoted), reQuoteValue: formatNumber(rb.callbacksQuoted) },
        { label: 'CB → Quote Rate', newValue: formatPercent(nb.callbackToQuoteRate), reQuoteValue: formatPercent(rb.callbackToQuoteRate) },
      ],
    },
    {
      title: 'Quoting',
      summaryValue: formatPercent(kpis.quoteRate),
      summaryLabel: 'Quote Rate',
      icon: Target,
      color: 'hsl(var(--kpi-quotes))',
      breakdownRows: [
        { label: 'Quoted', newValue: formatNumber(nb.quoted), reQuoteValue: formatNumber(rb.quoted) },
        { label: 'Quote Rate', newValue: formatPercent(nb.quoteRate), reQuoteValue: formatPercent(rb.quoteRate) },
        { label: 'Contact → Quote', newValue: formatPercent(nb.contactToQuoteRate), reQuoteValue: formatPercent(rb.contactToQuoteRate) },
        { label: 'Avg Calls to Qt', newValue: nb.avgCallsToQuote.toFixed(1), reQuoteValue: rb.avgCallsToQuote.toFixed(1) },
        { label: 'Avg Days to Qt (Seen)', newValue: nb.avgDaysToQuote.toFixed(1), reQuoteValue: rb.avgDaysToQuote.toFixed(1) },
        { label: 'Avg Days to Qt (Contact)', newValue: nb.avgDaysContactToQuote.toFixed(1), reQuoteValue: rb.avgDaysContactToQuote.toFixed(1) },
        { label: 'Single-Touch Quote %', newValue: formatPercent(nb.singleTouchQuotePct), reQuoteValue: formatPercent(rb.singleTouchQuotePct) },
      ],
    },
    {
      title: 'Sold Pipeline',
      summaryValue: formatPercent(kpis.quotedToSoldRate),
      summaryLabel: 'Quote → Sold Rate',
      icon: ShieldCheck,
      color: 'hsl(var(--kpi-contacts))',
      breakdownRows: [
        { label: 'Sold', newValue: formatNumber(nb.sold), reQuoteValue: formatNumber(rb.sold) },
        { label: 'Sold Rate (of Leads)', newValue: formatPercent(nb.leads > 0 ? nb.sold / nb.leads : 0), reQuoteValue: formatPercent(rb.leads > 0 ? rb.sold / rb.leads : 0) },
        { label: 'Close Rate (Qt→Sold)', newValue: formatPercent(nb.quotedToSoldRate), reQuoteValue: formatPercent(rb.quotedToSoldRate) },
        { label: 'Avg Days to Sold (Seen)', newValue: nb.avgDaysToSoldFromSeen.toFixed(1), reQuoteValue: rb.avgDaysToSoldFromSeen.toFixed(1) },
        { label: 'Avg Days to Sold (Contact)', newValue: nb.avgDaysToSoldFromContact.toFixed(1), reQuoteValue: rb.avgDaysToSoldFromContact.toFixed(1) },
        { label: 'Qt → Sold Days', newValue: nb.avgDaysQuoteToSold.toFixed(1), reQuoteValue: rb.avgDaysQuoteToSold.toFixed(1) },
        { label: 'Qt → Sold Calls', newValue: nb.avgCallsQuoteToSold.toFixed(1), reQuoteValue: rb.avgCallsQuoteToSold.toFixed(1) },
      ],
    },
    {
      title: 'Data Quality',
      summaryValue: formatPercent(kpis.badPhoneRate),
      summaryLabel: 'Bad Phone Rate',
      icon: AlertTriangle,
      color: 'hsl(var(--kpi-bad))',
      breakdownRows: [
        { label: 'Bad Phone Count', newValue: formatNumber(nb.badPhoneCount), reQuoteValue: formatNumber(rb.badPhoneCount) },
        { label: 'Bad Phone %', newValue: formatPercent(nb.badPhoneRate), reQuoteValue: formatPercent(rb.badPhoneRate) },
        { label: 'Stale Pipeline (7d+)', newValue: formatNumber(nb.stalePipelineCount), reQuoteValue: formatNumber(rb.stalePipelineCount) },
        { label: 'Do Not Call', newValue: formatNumber(nb.doNotCallCount), reQuoteValue: formatNumber(rb.doNotCallCount) },
        { label: 'DNC Rate', newValue: formatPercent(nb.doNotCallRate), reQuoteValue: formatPercent(rb.doNotCallRate) },
      ],
    },
  ] : [];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          Performance Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Call performance and lead conversion metrics</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {/* Skeleton loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-lg border p-5">
              <div className="flex items-start justify-between mb-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16 mt-2" />
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="py-4 px-4 bg-destructive/10 text-destructive text-sm rounded-lg mb-4">
          Failed to load data: {(error as Error).message}
        </div>
      )}

      {/* KPI cards */}
      {!isLoading && groupedCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {groupedCards.map((card) => (
            <FlipKPICard key={card.title} {...card} />
          ))}
        </div>
      )}

      {/* No data state */}
      {!isLoading && !error && (!kpis || kpis.totalLeads === 0) && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-base font-medium mb-1">No data yet</p>
          <p className="text-sm">Upload a Daily Call Report or Deer Dama (Lead) Report to see metrics.</p>
        </div>
      )}

      {/* Charts row */}
      {!isLoading && kpis && kpis.totalLeads > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Daily trends chart */}
          <div className="lg:col-span-2 bg-card rounded-lg border p-5">
            <h3 className="section-title mb-1">Daily Trends</h3>
            <p className="text-xs text-muted-foreground mb-4">Calls, contacts, voicemails, and callbacks per day</p>
            {dailyTrends && dailyTrends.length > 1 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyTrends} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(220,70%,60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(220,70%,60%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradContacts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(152,60%,40%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(152,60%,40%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradVM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--kpi-voicemails))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--kpi-voicemails))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(270,55%,50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(270,55%,50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'hsl(var(--card-foreground))',
                    }}
                    labelFormatter={(d) => `Date: ${d}`}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {/* Lines use both color AND dash pattern for colorblind accessibility */}
                  <Area type="monotone" dataKey="totalCalls" name="Total Calls" stroke="hsl(220,70%,60%)" fill="url(#gradCalls)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="contacts" name="Contacts" stroke="hsl(152,60%,40%)" fill="url(#gradContacts)" strokeWidth={1.5} strokeDasharray="6 0" dot={false} />
                  <Area type="monotone" dataKey="voicemails" name="Voicemails" stroke="hsl(var(--kpi-voicemails))" fill="url(#gradVM)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                  <Area type="monotone" dataKey="callbacks" name="Callbacks" stroke="hsl(270,55%,50%)" fill="url(#gradCB)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-md">
                Trend chart available after multiple days of data
              </div>
            )}
          </div>

          {/* Contact Timing */}
          <div className="bg-card rounded-lg border p-5">
            <h3 className="section-title mb-1">Contact Timing</h3>
            <p className="text-xs text-muted-foreground mb-4">Days from first seen to first contact</p>
            <div className="space-y-3">
              {(timing ?? []).map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-foreground font-medium">{row.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {row.count} ({row.pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, row.pct)}%`,
                        backgroundColor: row.label === 'Never' ? 'hsl(var(--kpi-bad))' : 'hsl(var(--kpi-leads))',
                        opacity: row.label === 'Never' ? 0.7 : 1,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New vs Re-Quote comparison */}
      {!isLoading && nb && rb && kpis && kpis.totalLeads > 0 && (
        <div className="bg-card rounded-lg border p-5">
          <h3 className="section-title mb-4">New Leads vs Re-Quotes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2 pr-4">Metric</th>
                  <th className="text-right text-xs font-semibold uppercase tracking-wider py-2 px-4 text-primary">New Leads</th>
                  <th className="text-right text-xs font-semibold uppercase tracking-wider py-2 pl-4" style={{ color: 'hsl(var(--kpi-callbacks))' }}>Re-Quotes</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Total Leads',              nv: formatNumber(nb.leads),                    rv: formatNumber(rb.leads) },
                  { label: 'Contacts',                 nv: formatNumber(nb.contacts),                 rv: formatNumber(rb.contacts) },
                  { label: 'Contact Rate',             nv: formatPercent(nb.contactRate),             rv: formatPercent(rb.contactRate) },
                  { label: 'No-Contact Count',         nv: formatNumber(nb.noContactCount),           rv: formatNumber(rb.noContactCount) },
                  { label: 'No-Contact Rate',          nv: formatPercent(nb.noContactRate),           rv: formatPercent(rb.noContactRate) },
                  { label: 'Voicemails Left',          nv: formatNumber(nb.voicemailLeads),           rv: formatNumber(rb.voicemailLeads) },
                  { label: 'Voicemail Rate',           nv: formatPercent(nb.voicemailRate),           rv: formatPercent(rb.voicemailRate) },
                  { label: 'Callbacks',                nv: formatNumber(nb.callbacks),                rv: formatNumber(rb.callbacks) },
                  { label: 'CB w/ Voicemail',          nv: formatNumber(nb.voicemailCallbacks),       rv: formatNumber(rb.voicemailCallbacks) },
                  { label: 'CB w/o Voicemail',         nv: formatNumber(nb.nonVoicemailCallbacks),    rv: formatNumber(rb.nonVoicemailCallbacks) },
                  { label: 'VM CB → Quote %',          nv: formatPercent(nb.voicemailCallbackToQuoteRate), rv: formatPercent(rb.voicemailCallbackToQuoteRate) },
                  { label: 'Non-VM CB → Quote %',      nv: formatPercent(nb.nonVoicemailCallbackToQuoteRate), rv: formatPercent(rb.nonVoicemailCallbackToQuoteRate) },
                  { label: 'CB → Quoted',              nv: formatNumber(nb.callbacksQuoted),          rv: formatNumber(rb.callbacksQuoted) },
                  { label: 'CB → Quote Rate',          nv: formatPercent(nb.callbackToQuoteRate),     rv: formatPercent(rb.callbackToQuoteRate) },
                  { label: 'Quoted',                   nv: formatNumber(nb.quoted),                   rv: formatNumber(rb.quoted) },
                  { label: 'Quote Rate',               nv: formatPercent(nb.quoteRate),               rv: formatPercent(rb.quoteRate) },
                  { label: 'Contact → Quote',          nv: formatPercent(nb.contactToQuoteRate),      rv: formatPercent(rb.contactToQuoteRate) },
                  { label: 'Avg Days to Qt (Contact)', nv: nb.avgDaysContactToQuote.toFixed(1),       rv: rb.avgDaysContactToQuote.toFixed(1) },
                  { label: 'Single-Touch Quote %',     nv: formatPercent(nb.singleTouchQuotePct),     rv: formatPercent(rb.singleTouchQuotePct) },
                  { label: 'Avg Calls to Quote',       nv: nb.avgCallsToQuote.toFixed(1),             rv: rb.avgCallsToQuote.toFixed(1) },
                  { label: 'Avg Days to Quote (Seen)', nv: nb.avgDaysToQuote.toFixed(1),              rv: rb.avgDaysToQuote.toFixed(1) },
                  { label: 'Sold',                     nv: formatNumber(nb.sold),                     rv: formatNumber(rb.sold) },
                  { label: 'Qt → Sold Rate',           nv: formatPercent(nb.quotedToSoldRate),        rv: formatPercent(rb.quotedToSoldRate) },
                  { label: 'Avg Days to Sold',         nv: nb.avgDaysToSoldFromSeen.toFixed(1),       rv: rb.avgDaysToSoldFromSeen.toFixed(1) },
                  { label: 'Stale Pipeline (7d+)',     nv: formatNumber(nb.stalePipelineCount),       rv: formatNumber(rb.stalePipelineCount) },
                  { label: 'Bad Phone Count',          nv: formatNumber(nb.badPhoneCount),            rv: formatNumber(rb.badPhoneCount) },
                  { label: 'Bad Phone %',              nv: formatPercent(nb.badPhoneRate),            rv: formatPercent(rb.badPhoneRate) },
                  { label: 'Do Not Call',              nv: formatNumber(nb.doNotCallCount),           rv: formatNumber(rb.doNotCallCount) },
                  { label: 'DNC Rate',                 nv: formatPercent(nb.doNotCallRate),           rv: formatPercent(rb.doNotCallRate) },
                ].map((row, i) => (
                  <tr key={row.label} className={i % 2 === 1 ? 'bg-secondary/20' : ''}>
                    <td className="py-2.5 pr-4 text-foreground">{row.label}</td>
                    <td className="py-2.5 px-4 text-right font-bold tabular-nums text-primary">{row.nv}</td>
                    <td className="py-2.5 pl-4 text-right font-bold tabular-nums" style={{ color: 'hsl(var(--kpi-callbacks))' }}>{row.rv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
