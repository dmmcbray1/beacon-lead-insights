import { useState } from 'react';
import { Search, Download, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSeedLeads } from '@/lib/seedData';

const leads = getSeedLeads();

export default function LeadExplorer() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = leads.filter(l => {
    const matchesSearch = !search ||
      l.phone.includes(search) ||
      (l.lead_id?.toLowerCase().includes(search.toLowerCase())) ||
      l.staff.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' ||
      (typeFilter === 'new' && l.lead_type === 'New') ||
      (typeFilter === 're_quote' && l.lead_type === 'Re-Quote');
    return matchesSearch && matchesType;
  });

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>Lead Explorer</h1>
          <p className="text-sm text-muted-foreground mt-1">Search and filter all lead records</p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="filter-bar">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by phone, Lead ID, or staff..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary rounded-md border-0 outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-2 text-sm border-0 outline-none cursor-pointer"
        >
          <option value="all">All Types</option>
          <option value="new">New Leads</option>
          <option value="re_quote">Re-Quotes</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              {['Phone', 'Lead ID', 'Agency', 'Type', 'Status', 'Staff', 'First Seen', 'First Contact', 'First Quote', 'Calls', 'Callbacks', 'Vendor', 'Match'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-medium text-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(lead => (
              <tr key={lead.id} className="border-t hover:bg-muted/50 transition-colors cursor-pointer">
                <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{lead.phone}</td>
                <td className="px-3 py-2.5 text-primary font-mono text-xs">{lead.lead_id || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.agency}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    lead.lead_type === 'New' ? 'bg-primary/10 text-primary' : 'bg-kpi-callbacks/10 text-kpi-callbacks'
                  }`}>{lead.lead_type}</span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{lead.status}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.staff}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.first_seen}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.first_contact || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{lead.first_quote || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{lead.calls}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{lead.callbacks}</td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{lead.vendor}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    lead.lead_id ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                  }`}>
                    {lead.lead_id ? 'ID+Phone' : 'Phone'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-3">{filtered.length} leads shown</p>
    </div>
  );
}
