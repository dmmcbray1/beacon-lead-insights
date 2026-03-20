import { useState } from 'react';
import { getSeedStaffPerformance, getSeedKPIs } from '@/lib/seedData';
import { formatPercent, formatNumber } from '@/lib/metrics';
import FilterBar from '@/components/FilterBar';
import KPICard from '@/components/KPICard';
import { Building2, Users, UserCheck, FileCheck, PhoneIncoming, Target, Percent, TrendingUp } from 'lucide-react';

const agencies = [
  {
    name: 'McBrayer Agency',
    leads: 842, contacts: 432, quoted: 148, callbacks: 127,
    contactRate: 0.513, quoteRate: 0.176, contactToQuoteRate: 0.343, callbackToQuoteRate: 0.307,
  },
  {
    name: 'Summit Insurance Group',
    leads: 405, contacts: 209, quoted: 70, callbacks: 60,
    contactRate: 0.516, quoteRate: 0.173, contactToQuoteRate: 0.335, callbackToQuoteRate: 0.283,
  },
];

export default function AgencyPerformance() {
  const [filters, setFilters] = useState({
    dateRange: '30d', agency: 'all', staff: 'all', leadType: 'all', dateBasis: 'lead_created',
  });

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>Agency Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare performance across agencies</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {agencies.map(agency => (
        <div key={agency.name} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{agency.name}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            <KPICard label="Leads" value={formatNumber(agency.leads)} icon={Users} color="hsl(215,72%,40%)" />
            <KPICard label="Contacts" value={formatNumber(agency.contacts)} icon={UserCheck} color="hsl(152,60%,40%)" />
            <KPICard label="Quoted" value={formatNumber(agency.quoted)} icon={FileCheck} color="hsl(38,92%,50%)" />
            <KPICard label="Callbacks" value={formatNumber(agency.callbacks)} icon={PhoneIncoming} color="hsl(270,55%,50%)" />
            <KPICard label="Contact %" value={formatPercent(agency.contactRate)} icon={Percent} color="hsl(152,60%,40%)" />
            <KPICard label="Quote %" value={formatPercent(agency.quoteRate)} icon={Target} color="hsl(38,92%,50%)" />
            <KPICard label="C→Q %" value={formatPercent(agency.contactToQuoteRate)} icon={TrendingUp} color="hsl(215,72%,40%)" />
            <KPICard label="CB→Q %" value={formatPercent(agency.callbackToQuoteRate)} icon={TrendingUp} color="hsl(270,55%,50%)" />
          </div>
        </div>
      ))}
    </div>
  );
}
