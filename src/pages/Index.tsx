import { useState } from 'react';
import {
  Users, UserCheck, PhoneCall, FileCheck, PhoneOff,
  TrendingUp, Target, ArrowRightLeft, BarChart3, Clock, Percent, PhoneIncoming, CheckCircle2,
  Layers, Activity, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import FlipKPICard from '@/components/FlipKPICard';
import FilterBar from '@/components/FilterBar';
import { getSeedKPIs, getSeedTrendData } from '@/lib/seedData';
import { formatPercent, formatNumber } from '@/lib/metrics';

const kpis = getSeedKPIs();
const trendData = getSeedTrendData();
const nb = kpis.newBreakdown;
const rb = kpis.reQuoteBreakdown;

const contactTiming = [
  { label: 'Day 0–1', count: 287, pct: 44.8 },
  { label: 'Day 2–7', count: 198, pct: 30.9 },
  { label: 'Day 8–30', count: 112, pct: 17.5 },
  { label: '31+ Days', count: 31, pct: 4.8 },
  { label: 'Never', count: 13, pct: 2.0 },
];

export default function Dashboard() {
  const [filters, setFilters] = useState({
    dateRange: '30d',
    agency: 'all',
    staff: 'all',
    leadType: 'all',
    dateBasis: 'lead_created',
    vendorFilter: true,
  });

  const groupedCards = [
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
        { label: 'Callbacks', newValue: formatNumber(nb.callbacks), reQuoteValue: formatNumber(rb.callbacks) },
        { label: 'CB → Quote', newValue: formatPercent(nb.callbackToQuoteRate), reQuoteValue: formatPercent(rb.callbackToQuoteRate) },
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
        { label: 'Avg Days to Qt', newValue: nb.avgDaysToQuote.toFixed(1), reQuoteValue: rb.avgDaysToQuote.toFixed(1) },
      ],
    },
    {
      title: 'Sold Pipeline',
      summaryValue: kpis.avgDaysToSoldFromSeen.toFixed(1),
      summaryLabel: 'Avg Days to Sold (Seen)',
      icon: ShieldCheck,
      color: 'hsl(var(--kpi-contacts))',
      breakdownRows: [
        { label: 'Days Sold (Seen)', newValue: nb.avgDaysToSoldFromSeen.toFixed(1), reQuoteValue: rb.avgDaysToSoldFromSeen.toFixed(1) },
        { label: 'Days Sold (Contact)', newValue: nb.avgDaysToSoldFromContact.toFixed(1), reQuoteValue: rb.avgDaysToSoldFromContact.toFixed(1) },
        { label: 'Qt → Sold Days', newValue: nb.avgDaysQuoteToSold.toFixed(1), reQuoteValue: rb.avgDaysQuoteToSold.toFixed(1) },
        { label: 'Qt → Sold Calls', newValue: nb.avgCallsQuoteToSold.toFixed(1), reQuoteValue: rb.avgCallsQuoteToSold.toFixed(1) },
      ],
    },
    {
      title: 'Data Quality',
      summaryValue: formatNumber(kpis.badPhoneCount),
      summaryLabel: 'Bad Phone Numbers',
      icon: AlertTriangle,
      color: 'hsl(var(--kpi-bad))',
      breakdownRows: [
        { label: 'Bad Phone Count', newValue: formatNumber(nb.badPhoneCount), reQuoteValue: formatNumber(rb.badPhoneCount) },
        { label: 'Bad Phone %', newValue: formatPercent(nb.badPhoneRate), reQuoteValue: formatPercent(rb.badPhoneRate) },
      ],
    },
  ];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          Performance Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Call performance and lead conversion metrics</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {/* Grouped Flip KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {groupedCards.map((card) => (
          <FlipKPICard key={card.title} {...card} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-card rounded-lg border p-5">
          <h3 className="section-title mb-4">Daily Trends</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--kpi-leads))" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(var(--kpi-leads))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradContacts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--kpi-contacts))" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(var(--kpi-contacts))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradQuotes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--kpi-quotes))" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(var(--kpi-quotes))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} className="stroke-muted-foreground" />
              <YAxis tick={{ fontSize: 12 }} className="stroke-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              />
              <Area type="monotone" dataKey="leads" stroke="hsl(var(--kpi-leads))" fill="url(#gradLeads)" strokeWidth={2} />
              <Area type="monotone" dataKey="contacts" stroke="hsl(var(--kpi-contacts))" fill="url(#gradContacts)" strokeWidth={2} />
              <Area type="monotone" dataKey="quotes" stroke="hsl(var(--kpi-quotes))" fill="url(#gradQuotes)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border p-5">
          <h3 className="section-title mb-4">Contact Timing</h3>
          <p className="text-xs text-muted-foreground mb-4">Days from first seen to first contact</p>
          <div className="space-y-3">
            {contactTiming.map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">{row.label}</span>
                  <span className="text-muted-foreground tabular-nums">{row.count} ({row.pct}%)</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${row.pct}%`,
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

      {/* New vs Re-Quote Comparison Footer */}
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
                { label: 'Total Leads', nv: formatNumber(nb.leads), rv: formatNumber(rb.leads) },
                { label: 'Contacts', nv: formatNumber(nb.contacts), rv: formatNumber(rb.contacts) },
                { label: 'Contact Rate', nv: formatPercent(nb.contactRate), rv: formatPercent(rb.contactRate) },
                { label: 'Callbacks', nv: formatNumber(nb.callbacks), rv: formatNumber(rb.callbacks) },
                { label: 'CB → Quote Rate', nv: formatPercent(nb.callbackToQuoteRate), rv: formatPercent(rb.callbackToQuoteRate) },
                { label: 'Quoted', nv: formatNumber(nb.quoted), rv: formatNumber(rb.quoted) },
                { label: 'Quote Rate', nv: formatPercent(nb.quoteRate), rv: formatPercent(rb.quoteRate) },
                { label: 'Contact → Quote', nv: formatPercent(nb.contactToQuoteRate), rv: formatPercent(rb.contactToQuoteRate) },
                { label: 'Avg Calls to Quote', nv: nb.avgCallsToQuote.toFixed(1), rv: rb.avgCallsToQuote.toFixed(1) },
                { label: 'Avg Days to Quote', nv: nb.avgDaysToQuote.toFixed(1), rv: rb.avgDaysToQuote.toFixed(1) },
                { label: 'Bad Phone Count', nv: formatNumber(nb.badPhoneCount), rv: formatNumber(rb.badPhoneCount) },
                { label: 'Bad Phone %', nv: formatPercent(nb.badPhoneRate), rv: formatPercent(rb.badPhoneRate) },
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
    </div>
  );
}
