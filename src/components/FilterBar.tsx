import { Calendar, Building2, Users, Tag, FileText, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgencies, useStaffMembers } from '@/hooks/useLeadData';
import { useAuth } from '@/hooks/useAuth';

interface FilterBarFilters {
  dateRange: string;
  agency: string;
  staff: string;
  leadType: string;
  dateBasis: string;
  vendorFilter?: boolean;
  customFrom?: string;
  customTo?: string;
}

interface FilterBarProps {
  filters: FilterBarFilters;
  onChange: (filters: FilterBarFilters) => void;
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const { isAdmin } = useAuth();
  const update = (key: string, value: string | boolean) => onChange({ ...filters, [key]: value });

  const { data: agencies } = useAgencies();
  const { data: staffMembers } = useStaffMembers();

  return (
    <div className="filter-bar">
      {/* Date Range */}
      <div className="flex items-center gap-1.5">
        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <Select value={filters.dateRange} onValueChange={(v) => update('dateRange', v)}>
          <SelectTrigger
            className="h-8 min-w-[130px] text-sm bg-secondary border-0 shadow-none focus:ring-1"
            aria-label="Date range"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="mtd">Month to Date</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        {filters.dateRange === 'custom' && (
          <div className="flex items-center gap-1.5 mt-2">
            <input type="date" value={filters.customFrom ?? ''} onChange={(e) => update('customFrom', e.target.value)}
              className="h-8 bg-secondary rounded-md px-2 text-sm border-0 outline-none" />
            <span className="text-muted-foreground text-xs">to</span>
            <input type="date" value={filters.customTo ?? ''} onChange={(e) => update('customTo', e.target.value)}
              className="h-8 bg-secondary rounded-md px-2 text-sm border-0 outline-none" />
          </div>
        )}
      </div>

      {/* Date Basis */}
      <div className="flex items-center gap-1.5">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <Select value={filters.dateBasis} onValueChange={(v) => update('dateBasis', v)}>
          <SelectTrigger
            className="h-8 min-w-[150px] text-sm bg-secondary border-0 shadow-none focus:ring-1"
            aria-label="Date basis"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lead_created">Lead Created</SelectItem>
            <SelectItem value="call_date">Call Date</SelectItem>
            <SelectItem value="first_contact">First Contact</SelectItem>
            <SelectItem value="first_quote">First Quote</SelectItem>
            <SelectItem value="callback_date">Callback Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Agency — admin only */}
      {isAdmin && (
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <Select value={filters.agency} onValueChange={(v) => update('agency', v)}>
            <SelectTrigger
              className="h-8 min-w-[140px] text-sm bg-secondary border-0 shadow-none focus:ring-1"
              aria-label="Agency"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agencies</SelectItem>
              {(agencies ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Staff */}
      <div className="flex items-center gap-1.5">
        <Users className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <Select value={filters.staff} onValueChange={(v) => update('staff', v)}>
          <SelectTrigger
            className="h-8 min-w-[120px] text-sm bg-secondary border-0 shadow-none focus:ring-1"
            aria-label="Staff member"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {(staffMembers ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lead Type */}
      <div className="flex items-center gap-1.5">
        <Tag className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <Select value={filters.leadType} onValueChange={(v) => update('leadType', v)}>
          <SelectTrigger
            className="h-8 min-w-[130px] text-sm bg-secondary border-0 shadow-none focus:ring-1"
            aria-label="Lead type"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lead Types</SelectItem>
            <SelectItem value="new">New Leads</SelectItem>
            <SelectItem value="re_quote">Re-Quotes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vendor filter toggle */}
      {filters.vendorFilter !== undefined && (
        <button
          onClick={() => update('vendorFilter', !filters.vendorFilter)}
          className={`flex items-center gap-1.5 text-sm rounded-md px-2.5 py-1.5 transition-colors cursor-pointer ${
            filters.vendorFilter
              ? 'bg-primary/10 text-primary font-medium'
              : 'bg-secondary text-muted-foreground'
          }`}
          aria-pressed={filters.vendorFilter}
          aria-label={filters.vendorFilter ? 'Beacon Territory filter on — click to disable' : 'Beacon Territory filter off — click to enable'}
        >
          <Filter className="w-4 h-4" aria-hidden="true" />
          {filters.vendorFilter ? 'Beacon Territory On' : 'Beacon Territory Off'}
        </button>
      )}
    </div>
  );
}
