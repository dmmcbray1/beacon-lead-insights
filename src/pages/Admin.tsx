import { useState } from 'react';
import { Settings, FileText, Phone, Tag, Building2, Users, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONTACT_DISPOSITIONS, QUOTE_DISPOSITIONS, BAD_PHONE_STATUSES, DEFAULT_CALL_TYPE_MAPPINGS, CALLBACK_CALL_TYPES } from '@/lib/constants';

type Tab = 'dispositions' | 'call_types' | 'agencies' | 'staff' | 'data_quality';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('dispositions');

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'dispositions', label: 'Disposition Mapping', icon: Tag },
    { id: 'call_types', label: 'Call Type Mapping', icon: Phone },
    { id: 'agencies', label: 'Agencies', icon: Building2 },
    { id: 'staff', label: 'Staff Members', icon: Users },
    { id: 'data_quality', label: 'Data Quality', icon: AlertTriangle },
  ];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>Admin Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure mappings, agencies, and review data quality</p>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Disposition Mapping */}
      {tab === 'dispositions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-card border rounded-lg p-5">
            <h3 className="section-title mb-3">Contact Dispositions</h3>
            <p className="text-xs text-muted-foreground mb-4">Current Status values that qualify as a contact</p>
            <div className="space-y-2">
              {CONTACT_DISPOSITIONS.map(d => (
                <div key={d} className="flex items-center gap-2 px-3 py-2 bg-success/5 rounded-md text-sm text-foreground">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border rounded-lg p-5">
            <h3 className="section-title mb-3">Quote Dispositions</h3>
            <p className="text-xs text-muted-foreground mb-4">Current Status values that qualify as a quoted household</p>
            <div className="space-y-2">
              {QUOTE_DISPOSITIONS.map(d => (
                <div key={d} className="flex items-center gap-2 px-3 py-2 bg-warning/5 rounded-md text-sm text-foreground">
                  <div className="w-2 h-2 rounded-full bg-warning" />
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border rounded-lg p-5">
            <h3 className="section-title mb-3">Bad Phone Statuses</h3>
            <p className="text-xs text-muted-foreground mb-4">Current Status values indicating a bad phone number</p>
            <div className="space-y-2">
              {BAD_PHONE_STATUSES.map(d => (
                <div key={d} className="flex items-center gap-2 px-3 py-2 bg-destructive/5 rounded-md text-sm text-foreground">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  {d}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Call Type Mapping */}
      {tab === 'call_types' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border rounded-lg p-5">
            <h3 className="section-title mb-3">Call Direction Mapping</h3>
            <p className="text-xs text-muted-foreground mb-4">Maps Call Type to direction to determine lead phone number</p>
            <div className="space-y-2">
              {Object.entries(DEFAULT_CALL_TYPE_MAPPINGS).map(([type, dir]) => (
                <div key={type} className="flex items-center justify-between px-3 py-2.5 bg-muted rounded-md text-sm">
                  <span className="text-foreground font-medium">{type}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    dir === 'outbound' ? 'bg-primary/10 text-primary' : 'bg-kpi-callbacks/10 text-kpi-callbacks'
                  }`}>{dir === 'outbound' ? 'Lead Phone = To' : 'Lead Phone = From'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border rounded-lg p-5">
            <h3 className="section-title mb-3">Callback Call Types</h3>
            <p className="text-xs text-muted-foreground mb-4">Call Types that generate callback events</p>
            <div className="space-y-2">
              {CALLBACK_CALL_TYPES.map(t => (
                <div key={t} className="flex items-center gap-2 px-3 py-2.5 bg-kpi-callbacks/5 rounded-md text-sm text-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(270,55%,50%)' }} />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Agencies */}
      {tab === 'agencies' && (
        <div className="bg-card border rounded-lg p-5 max-w-lg">
          <h3 className="section-title mb-3">Agencies</h3>
          <div className="space-y-2 mb-4">
            {['McBrayer Agency', 'Summit Insurance Group'].map(a => (
              <div key={a} className="flex items-center justify-between px-3 py-2.5 bg-muted rounded-md text-sm">
                <span className="text-foreground font-medium">{a}</span>
                <span className="text-xs text-muted-foreground">{a === 'McBrayer Agency' ? 'Default' : ''}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm">Add Agency</Button>
        </div>
      )}

      {/* Staff */}
      {tab === 'staff' && (
        <div className="bg-card border rounded-lg p-5 max-w-lg">
          <h3 className="section-title mb-3">Staff Members</h3>
          <div className="space-y-2 mb-4">
            {['Rachel Torres', 'Marcus Chen', 'Denise Walters', 'James Okafor', 'Linda Pham'].map(s => (
              <div key={s} className="flex items-center justify-between px-3 py-2.5 bg-muted rounded-md text-sm">
                <span className="text-foreground font-medium">{s}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm">Add Staff Member</Button>
        </div>
      )}

      {/* Data Quality */}
      {tab === 'data_quality' && (
        <div className="bg-card border rounded-lg p-5">
          <h3 className="section-title mb-4">Data Quality Report</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Rows Imported', value: '3,847', color: 'text-foreground' },
              { label: 'Matched (ID + Phone)', value: '2,914', color: 'text-success' },
              { label: 'Matched (Phone Only)', value: '687', color: 'text-warning' },
              { label: 'Unmatched', value: '246', color: 'text-destructive' },
              { label: 'Invalid Phones', value: '38', color: 'text-destructive' },
              { label: 'Duplicate Inbound Suppressed', value: '124', color: 'text-muted-foreground' },
              { label: 'Missing Columns', value: '0', color: 'text-success' },
              { label: 'Unattributed Events', value: '15', color: 'text-warning' },
            ].map(item => (
              <div key={item.label} className="text-center p-4 bg-muted rounded-lg">
                <p className={`stat-value ${item.color}`}>{item.value}</p>
                <p className="stat-label mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
