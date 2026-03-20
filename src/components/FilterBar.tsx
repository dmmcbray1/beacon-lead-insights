import { Calendar, Building2, Users, Tag, FileText, Filter } from 'lucide-react';
import { SEED_AGENCIES, SEED_STAFF } from '@/lib/seedData';

interface FilterBarProps {
  filters: {
    dateRange: string;
    agency: string;
    staff: string;
    leadType: string;
    dateBasis: string;
    vendorFilter?: boolean;
  };
  onChange: (filters: any) => void;
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const update = (key: string, value: string | boolean) => onChange({ ...filters, [key]: value });

  return (
    <div className="filter-bar">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Calendar className="w-4 h-4" />
        <select
          value={filters.dateRange}
          onChange={e => update('dateRange', e.target.value)}
          className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-1.5 text-sm border-0 outline-none cursor-pointer"
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="ytd">Year to Date</option>
          <option value="all">All Time</option>
        </select>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <FileText className="w-4 h-4" />
        <select
          value={filters.dateBasis}
          onChange={e => update('dateBasis', e.target.value)}
          className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-1.5 text-sm border-0 outline-none cursor-pointer"
        >
          <option value="lead_created">Lead Created</option>
          <option value="call_date">Call Date</option>
          <option value="first_contact">First Contact</option>
          <option value="first_quote">First Quote</option>
          <option value="callback_date">Callback Date</option>
        </select>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4" />
        <select
          value={filters.agency}
          onChange={e => update('agency', e.target.value)}
          className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-1.5 text-sm border-0 outline-none cursor-pointer"
        >
          <option value="all">All Agencies</option>
          {SEED_AGENCIES.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="w-4 h-4" />
        <select
          value={filters.staff}
          onChange={e => update('staff', e.target.value)}
          className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-1.5 text-sm border-0 outline-none cursor-pointer"
        >
          <option value="all">All Staff</option>
          {SEED_STAFF.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Tag className="w-4 h-4" />
        <select
          value={filters.leadType}
          onChange={e => update('leadType', e.target.value)}
          className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-1.5 text-sm border-0 outline-none cursor-pointer"
        >
          <option value="all">All Lead Types</option>
          <option value="new">New Leads</option>
          <option value="re_quote">Re-Quotes</option>
        </select>
      </div>

      {filters.vendorFilter !== undefined && (
        <button
          onClick={() => update('vendorFilter', !filters.vendorFilter)}
          className={`flex items-center gap-1.5 text-sm rounded-md px-2.5 py-1.5 transition-colors cursor-pointer ${
            filters.vendorFilter
              ? 'bg-primary/10 text-primary font-medium'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          <Filter className="w-4 h-4" />
          {filters.vendorFilter ? 'Vendor Filter On' : 'Vendor Filter Off'}
        </button>
      )}
    </div>
  );
}
