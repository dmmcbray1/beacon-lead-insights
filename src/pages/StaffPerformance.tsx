import { useState } from 'react';
import { getSeedStaffPerformance } from '@/lib/seedData';
import { formatPercent } from '@/lib/metrics';
import FilterBar from '@/components/FilterBar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const staffData = getSeedStaffPerformance();

export default function StaffPerformance() {
  const [filters, setFilters] = useState({
    dateRange: '30d', agency: 'all', staff: 'all', leadType: 'all', dateBasis: 'call_date',
  });

  const chartData = staffData.map(s => ({
    name: s.name.split(' ')[0],
    contacts: s.contacts,
    quoted: s.quoted,
    callbacks: s.callbacks,
  }));

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>Staff Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Individual agent metrics and comparisons</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {/* Chart */}
      <div className="bg-card border rounded-lg p-5 mb-6">
        <h3 className="section-title mb-4">Staff Comparison</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220,10%,46%)" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(220,10%,46%)" />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(0,0%,100%)', border: '1px solid hsl(220,13%,88%)', borderRadius: '8px', fontSize: '13px' }} />
            <Bar dataKey="contacts" fill="hsl(152,60%,40%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="quoted" fill="hsl(38,92%,50%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="callbacks" fill="hsl(270,55%,50%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              {['Staff', 'Agency', 'Calls', 'Contacts', 'Callbacks', 'Quoted', 'Contact %', 'Quote %', 'C→Q %', 'CB→Q %', 'Avg Calls', 'Avg Days', 'Bad Phone %'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-medium text-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffData.map(s => (
              <tr key={s.name} className="border-t hover:bg-muted/50 transition-colors">
                <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{s.name}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{s.agency}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.calls}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.contacts}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.callbacks}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.quoted}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.contactRate)}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.quoteRate)}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.contactToQuoteRate)}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.callbackToQuoteRate)}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.avgCallsToQuote.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.avgDaysToQuote.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatPercent(s.badPhoneRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
