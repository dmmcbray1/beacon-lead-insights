import { useState } from 'react';
import {
  Users, UserCheck, PhoneCall, FileCheck, PhoneOff,
  TrendingUp, Target, ArrowRightLeft, BarChart3, Clock, Percent, PhoneIncoming, CheckCircle2, Filter
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import KPICard from '@/components/KPICard';
import FilterBar from '@/components/FilterBar';
import { getSeedKPIs, getSeedTrendData } from '@/lib/seedData';
import { formatPercent, formatNumber } from '@/lib/metrics';

const kpis = getSeedKPIs();
const trendData = getSeedTrendData();

// Contact timing seed data
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

  const cards = [
    { label: 'Total Leads', value: formatNumber(kpis.totalLeads), icon: Users, color: 'hsl(215,72%,40%)' },
    { label: 'New Leads', value: formatNumber(kpis.newLeads), icon: Users, color: 'hsl(215,72%,50%)' },
    { label: 'Re-Quote Leads', value: formatNumber(kpis.reQuoteLeads), icon: ArrowRightLeft, color: 'hsl(270,55%,50%)' },
    { label: 'Total Contacts', value: formatNumber(kpis.totalContacts), icon: UserCheck, color: 'hsl(152,60%,40%)' },
    { label: 'Quoted Households', value: formatNumber(kpis.totalQuotedHouseholds), icon: FileCheck, color: 'hsl(38,92%,50%)' },
    { label: 'Total Callbacks', value: formatNumber(kpis.totalCallbacks), icon: PhoneIncoming, color: 'hsl(270,55%,50%)' },
    { label: 'Bad Phone', value: formatNumber(kpis.badPhoneCount), icon: PhoneOff, color: 'hsl(0,72%,51%)' },
    { label: 'Contact Rate', value: formatPercent(kpis.contactRate), icon: Percent, color: 'hsl(152,60%,40%)' },
    { label: 'Quote Rate', value: formatPercent(kpis.quoteRate), icon: Target, color: 'hsl(38,92%,50%)' },
    { label: 'Contact → Quote', value: formatPercent(kpis.contactToQuoteRate), icon: TrendingUp, color: 'hsl(215,72%,40%)' },
    { label: 'Callback → Quote', value: formatPercent(kpis.callbackToQuoteRate), icon: PhoneCall, color: 'hsl(270,55%,50%)' },
    { label: 'Avg Calls to Quote', value: kpis.avgCallsToQuote.toFixed(1), icon: BarChart3, color: 'hsl(38,92%,50%)' },
    { label: 'Avg Days to Quote', value: kpis.avgDaysToQuote.toFixed(1), icon: Clock, color: 'hsl(215,72%,50%)' },
    { label: 'Avg Days to Sold (Seen)', value: kpis.avgDaysToSoldFromSeen.toFixed(1), icon: CheckCircle2, color: 'hsl(152,60%,40%)' },
    { label: 'Avg Days to Sold (Contact)', value: kpis.avgDaysToSoldFromContact.toFixed(1), icon: CheckCircle2, color: 'hsl(152,60%,50%)' },
    { label: 'Quote → Sold Days', value: kpis.avgDaysQuoteToSold.toFixed(1), icon: Clock, color: 'hsl(38,92%,45%)' },
    { label: 'Quote → Sold Calls', value: kpis.avgCallsQuoteToSold.toFixed(1), icon: BarChart3, color: 'hsl(38,92%,45%)' },
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

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4 mb-8">
        {cards.slice(0, 7).map(c => (
          <KPICard key={c.label} {...c} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
        {cards.slice(7).map(c => (
          <KPICard key={c.label} {...c} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Trend Chart */}
        <div className="lg:col-span-2 bg-card rounded-lg border p-5">
          <h3 className="section-title mb-4">Daily Trends</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(215,72%,40%)" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(215,72%,40%)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradContacts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(152,60%,40%)" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(152,60%,40%)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradQuotes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38,92%,50%)" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(38,92%,50%)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(220,10%,46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220,10%,46%)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(0,0%,100%)',
                  border: '1px solid hsl(220,13%,88%)',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              />
              <Area type="monotone" dataKey="leads" stroke="hsl(215,72%,40%)" fill="url(#gradLeads)" strokeWidth={2} />
              <Area type="monotone" dataKey="contacts" stroke="hsl(152,60%,40%)" fill="url(#gradContacts)" strokeWidth={2} />
              <Area type="monotone" dataKey="quotes" stroke="hsl(38,92%,50%)" fill="url(#gradQuotes)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Contact Timing */}
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
                      backgroundColor: row.label === 'Never' ? 'hsl(0,72%,51%)' : 'hsl(215,72%,40%)',
                      opacity: row.label === 'Never' ? 0.7 : 1,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison: New vs Re-Quote */}
      <div className="bg-card rounded-lg border p-5 mb-8">
        <h3 className="section-title mb-4">New Leads vs Re-Quotes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { metric: 'Contact Rate', newVal: '49.2%', reqVal: '56.8%' },
            { metric: 'Quote Rate', newVal: '15.4%', reqVal: '22.3%' },
            { metric: 'Contact → Quote', newVal: '31.3%', reqVal: '39.3%' },
            { metric: 'Avg Days to Quote', newVal: '7.4', reqVal: '5.1' },
          ].map(row => (
            <div key={row.metric} className="text-center">
              <p className="text-sm text-muted-foreground mb-2">{row.metric}</p>
              <div className="flex items-center justify-center gap-4">
                <div>
                  <p className="text-lg font-bold text-primary tabular-nums">{row.newVal}</p>
                  <p className="text-[11px] text-muted-foreground">New</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'hsl(270,55%,50%)' }}>{row.reqVal}</p>
                  <p className="text-[11px] text-muted-foreground">Re-Quote</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
