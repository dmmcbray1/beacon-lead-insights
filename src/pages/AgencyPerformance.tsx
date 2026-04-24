import { useState } from 'react';
import { formatPercent, formatNumber } from '@/lib/metrics';
import FilterBar from '@/components/FilterBar';
import KPICard from '@/components/KPICard';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Users, UserCheck, FileCheck, PhoneIncoming, Target, Percent, TrendingUp } from 'lucide-react';
import { useAgencies, useKPIs, type Filters } from '@/hooks/useLeadData';

interface AgencyRowProps {
  agency: { id: string; name: string };
  filters: Filters;
}

function AgencyRow({ agency, filters }: AgencyRowProps) {
  const { kpis, isLoading } = useKPIs({ ...filters, agency: agency.id });

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{agency.name}</h2>
      </div>

      {isLoading || !kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card rounded-lg border p-5">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <KPICard label="Leads" value={formatNumber(kpis.totalLeads)} icon={Users} color="hsl(215,72%,40%)" />
          <KPICard label="Contacts" value={formatNumber(kpis.totalContacts)} icon={UserCheck} color="hsl(152,60%,40%)" />
          <KPICard label="Quoted" value={formatNumber(kpis.totalQuotedHouseholds)} icon={FileCheck} color="hsl(38,92%,50%)" />
          <KPICard label="Callbacks" value={formatNumber(kpis.totalCallbacks)} icon={PhoneIncoming} color="hsl(270,55%,50%)" />
          <KPICard label="Contact %" value={formatPercent(kpis.contactRate)} icon={Percent} color="hsl(152,60%,40%)" />
          <KPICard label="Quote %" value={formatPercent(kpis.quoteRate)} icon={Target} color="hsl(38,92%,50%)" />
          <KPICard label="C→Q %" value={formatPercent(kpis.contactToQuoteRate)} icon={TrendingUp} color="hsl(215,72%,40%)" />
          <KPICard label="CB→Q %" value={formatPercent(kpis.callbackToQuoteRate)} icon={TrendingUp} color="hsl(270,55%,50%)" />
        </div>
      )}
    </div>
  );
}

export default function AgencyPerformance() {
  const [filters, setFilters] = useState<Filters>({
    dateRange: '30d',
    agency: 'all',
    staff: 'all',
    leadType: 'all',
    dateBasis: 'lead_created',
    vendorFilter: true,
    customFrom: undefined,
    customTo: undefined,
  });

  const { data: agencies, isLoading } = useAgencies();

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>Agency Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare performance across agencies</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {isLoading && (
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-6 w-48 mb-4" />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} className="bg-card rounded-lg border p-5">
                    <Skeleton className="h-4 w-20 mb-3" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (agencies ?? []).length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-base font-medium mb-1">No agencies yet</p>
          <p className="text-sm">Agencies will appear here once they are created in the admin panel.</p>
        </div>
      )}

      {!isLoading && (agencies ?? []).map((agency) => (
        <AgencyRow key={agency.id} agency={agency} filters={filters} />
      ))}
    </div>
  );
}
