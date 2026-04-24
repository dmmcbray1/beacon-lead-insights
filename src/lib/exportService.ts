/**
 * Client-side export helpers (XLSX downloads).
 *
 * The xlsx library is already a dependency (used by importService for parsing);
 * this module reuses it for the write side.
 */

import * as XLSX from 'xlsx';
import type { LeadListRow } from '@/hooks/useLeadData';
import { formatPhone } from './phone';

function todayStamp(): string {
  return new Date().toISOString().split('T')[0];
}

/** Convert a LeadListRow to a flat object suitable for a spreadsheet row. */
function leadToExportRow(l: LeadListRow) {
  return {
    Name: l.name ?? '',
    Phone: formatPhone(l.phone),
    'Lead ID': l.leadIdExternal ?? '',
    Type: l.leadType === 're_quote' ? 'Re-Quote' : 'New',
    Status: l.status,
    Campaign: l.campaign ?? '',
    'Lead Cost': l.leadCost != null ? l.leadCost : '',
    Address: l.address ?? '',
    Email: l.email ?? '',
    'First Seen': l.firstSeen ?? '',
    'First Contact': l.firstContact ?? '',
    'First Quote': l.firstQuote ?? '',
    Calls: l.calls,
    Callbacks: l.callbacks,
    Vendor: l.vendor ?? '',
    'Bad Phone': l.isBadPhone ? 'Yes' : '',
  };
}

export function exportLeadsToXlsx(leads: LeadListRow[], filename?: string): void {
  const rows = leads.map(leadToExportRow);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, filename ?? `beacon-leads-${todayStamp()}.xlsx`);
}
