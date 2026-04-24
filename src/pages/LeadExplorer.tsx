import { useState } from 'react';
import { Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadList, type Filters } from '@/hooks/useLeadData';
import { formatPhone } from '@/lib/phone';
import { exportLeadsToXlsx } from '@/lib/exportService';

const HEADERS = [
  'Name', 'Phone', 'Type', 'Status', 'Campaign', 'Lead Cost',
  'Address', 'First Seen', 'First Contact', 'First Quote', 'Calls', 'CB', 'Bad?',
];

export default function LeadExplorer() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filters: Filters = {
    dateRange: 'all',
    agency: 'all',
    staff: 'all',
    leadType: typeFilter === 'all' ? 'all' : typeFilter,
    dateBasis: 'lead_created',
    vendorFilter: false,
    customFrom: undefined,
    customTo: undefined,
  };

  const { data: leads, isLoading, error } = useLeadList({ ...filters, search });

  const filtered = (leads ?? []).filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.phone.includes(search.replace(/\D/g, '')) ||
      formatPhone(l.phone).includes(search) ||
      (l.leadIdExternal?.toLowerCase().includes(s) ?? false) ||
      l.status.toLowerCase().includes(s) ||
      (l.name?.toLowerCase().includes(s) ?? false) ||
      (l.email?.toLowerCase().includes(s) ?? false) ||
      (l.campaign?.toLowerCase().includes(s) ?? false)
    );
  });

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
            Lead Explorer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Search and filter all lead records</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0}
          onClick={() => exportLeadsToXlsx(filtered)}
        >
          <Download className="w-4 h-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, campaign, status…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary rounded-md border-0 outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-2 text-sm border-0 outline-none cursor-pointer"
        >
          <option value="all">All Types</option>
          <option value="new">New Leads</option>
          <option value="re_quote">Re-Quotes</option>
        </select>
      </div>

      {isLoading && (
        <div className="bg-card border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                {HEADERS.map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-3 py-2.5" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <div className="py-4 px-4 bg-destructive/10 text-destructive text-sm rounded-lg mb-4">
          Failed to load leads: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="bg-card border rounded-lg overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {HEADERS.map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      {search ? 'No leads match your search.' : 'No leads yet. Upload a report to get started.'}
                    </td>
                  </tr>
                )}
                {filtered.map((lead) => (
                  <tr key={lead.id} className="border-t hover:bg-muted/50 transition-colors">
                    {/* Name */}
                    <td className="px-3 py-2.5 text-foreground whitespace-nowrap">
                      {lead.name || '—'}
                    </td>
                    {/* Phone */}
                    <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap font-mono text-xs">
                      {formatPhone(lead.phone)}
                    </td>
                    {/* Type */}
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        lead.leadType === 'new_lead' ? 'bg-primary/10 text-primary' : 'bg-kpi-callbacks/10'
                      }`}>
                        {lead.leadType === 'new_lead' ? 'New' : 'Re-Quote'}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap max-w-[180px] truncate">
                      {lead.status || '—'}
                    </td>
                    {/* Campaign */}
                    <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap max-w-[140px] truncate">
                      {lead.campaign || '—'}
                    </td>
                    {/* Lead Cost */}
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">
                      {lead.leadCost != null ? '$' + lead.leadCost.toFixed(2) : '—'}
                    </td>
                    {/* Address */}
                    <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate">
                      {lead.address || '—'}
                    </td>
                    {/* First Seen */}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.firstSeen ?? '—'}</td>
                    {/* First Contact */}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.firstContact ?? '—'}</td>
                    {/* First Quote */}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.firstQuote ?? '—'}</td>
                    {/* Calls */}
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{lead.calls}</td>
                    {/* CB */}
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{lead.callbacks}</td>
                    {/* Bad? */}
                    <td className="px-3 py-2.5">
                      {lead.isBadPhone && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Bad</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{filtered.length} leads shown</p>
        </>
      )}
    </div>
  );
}
