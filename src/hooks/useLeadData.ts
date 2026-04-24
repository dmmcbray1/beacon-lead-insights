/**
 * TanStack Query hooks that fetch real data from Supabase and replace all
 * seed/mock data calls in the application pages.
 */

import { useQuery } from '@tanstack/react-query';
import { subDays, startOfYear, startOfMonth, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { calculateKPIs, type LeadRecord, type KPIData } from '@/lib/metrics';
import {
  CONTACT_DISPOSITIONS,
  QUOTE_DISPOSITIONS,
  SOLD_DISPOSITIONS,
  BAD_PHONE_STATUSES,
  VENDOR_FILTER_RULES,
} from '@/lib/constants';

// ─── Filter types ─────────────────────────────────────────────────────────────

export interface Filters {
  dateRange: string;   // 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'mtd' | 'ytd' | 'all' | 'custom'
  agency: string;      // 'all' or agency UUID
  staff: string;       // 'all' or staff UUID
  leadType: string;    // 'all' | 'new' | 're_quote'
  dateBasis: string;   // 'lead_date' | 'call_date' | 'first_contact' | 'first_quote' | 'callback_date' | 'lead_created'
  vendorFilter?: boolean;
  customFrom?: string; // ISO date YYYY-MM-DD, used when dateRange === 'custom'
  customTo?: string;   // ISO date YYYY-MM-DD, used when dateRange === 'custom'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateBounds(filters: Filters): { from: string | null; to: string | null } {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  switch (filters.dateRange) {
    case 'today':     return { from: today, to: today };
    case 'yesterday': {
      const y = format(subDays(now, 1), 'yyyy-MM-dd');
      return { from: y, to: y };
    }
    case '7d':        return { from: format(subDays(now, 7), 'yyyy-MM-dd'), to: today };
    case '30d':       return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: today };
    case '90d':       return { from: format(subDays(now, 90), 'yyyy-MM-dd'), to: today };
    case 'mtd':       return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: today };
    case 'ytd':       return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: today };
    case 'custom':    return { from: filters.customFrom ?? null, to: filters.customTo ?? null };
    default:          return { from: null, to: null };
  }
}

function getDateField(dateBasis: string): string {
  switch (dateBasis) {
    case 'lead_date':      return 'lead_date';
    case 'call_date':      return 'latest_call_date';
    case 'first_contact':  return 'first_contact_date';
    case 'first_quote':    return 'first_quote_date';
    case 'callback_date':  return 'first_callback_date';
    default:               return 'lead_date';
  }
}

/** Derive a statuses[] array from the stored lead fields so calculateKPIs works correctly. */
function buildStatuses(lead: LeadRow): string[] {
  const statuses: string[] = [];
  if (lead.current_status) statuses.push(lead.current_status);

  const hasContactStatus = statuses.some((s) =>
    CONTACT_DISPOSITIONS.some((d) => d.toLowerCase() === s.toLowerCase())
  );
  const hasQuoteStatus = statuses.some((s) =>
    QUOTE_DISPOSITIONS.some((d) => d.toLowerCase() === s.toLowerCase())
  );
  const hasSoldStatus = statuses.some((s) =>
    SOLD_DISPOSITIONS.some((d) => d.toLowerCase() === s.toLowerCase())
  );
  const hasBadPhoneStatus = statuses.some((s) =>
    BAD_PHONE_STATUSES.some((d) => d.toLowerCase() === s.toLowerCase())
  );

  // If we have date evidence but the current_status doesn't reflect it
  // (e.g. status reverted), inject a synthetic status to ensure correct classification.
  if (lead.has_bad_phone && !hasBadPhoneStatus) statuses.push('1.2 CALLED - Bad Phone #');
  if (lead.first_contact_date && !hasContactStatus) statuses.push('2.0 CONTACTED - Follow Up');
  if (lead.first_quote_date && !hasQuoteStatus) statuses.push('3.0 QUOTED');
  if (lead.first_sold_date && !hasSoldStatus) statuses.push('4.0 SOLD');

  return statuses;
}

/**
 * Build the call_type hint used by passesVendorFilter().
 * We store a semantic tag in latest_vendor_name during import.
 */
function buildCallType(lead: LeadRow): string {
  const lt = (lead.current_lead_type ?? '').toLowerCase();
  const vn = (lead.latest_vendor_name ?? '').toLowerCase();

  if (lt === 're_quote' || vn.includes(VENDOR_FILTER_RULES.reQuoteSubstring)) return 'requote';
  if (vn === 'inbound call' || vn === 'inbound ivr') return vn;
  if (vn.includes(VENDOR_FILTER_RULES.newOutboundSubstring)) return vn; // 'beacon territory'
  return vn;
}

type LeadRow = {
  id: string;
  normalized_phone: string;
  agency_id: string;
  current_lead_type: string | null;
  current_status: string | null;
  first_seen_date: string | null;
  first_contact_date: string | null;
  first_callback_date: string | null;
  first_quote_date: string | null;
  first_sold_date: string | null;
  latest_call_date: string | null;
  total_call_attempts: number | null;
  total_callbacks: number | null;
  total_voicemails: number | null;
  calls_at_first_quote: number | null;
  calls_at_first_sold: number | null;
  has_bad_phone: boolean | null;
  latest_vendor_name: string | null;
  lead_id_external: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  campaign: string | null;
  lead_date: string | null;
  lead_cost: number | null;
};

function toLeadRecord(lead: LeadRow): LeadRecord {
  return {
    id: lead.id,
    normalized_phone: lead.normalized_phone,
    agency_id: lead.agency_id,
    lead_type: lead.current_lead_type,
    current_status: lead.current_status,
    first_seen_date: lead.first_seen_date,
    first_contact_date: lead.first_contact_date,
    first_callback_date: lead.first_callback_date,
    first_quote_date: lead.first_quote_date,
    first_sold_date: lead.first_sold_date,
    total_call_attempts: lead.total_call_attempts ?? 0,
    total_callbacks: lead.total_callbacks ?? 0,
    total_voicemails: lead.total_voicemails ?? 0,
    calls_at_first_quote: lead.calls_at_first_quote,
    calls_at_first_sold: lead.calls_at_first_sold,
    has_bad_phone: lead.has_bad_phone ?? false,
    is_do_not_call: lead.current_status?.toLowerCase() === 'xx - do not call - xx' || false,
    latest_call_date: lead.latest_call_date,
    statuses: buildStatuses(lead),
    call_type: buildCallType(lead),
    vendor_name: lead.latest_vendor_name,
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    street_address: lead.street_address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    campaign: lead.campaign,
    lead_date: lead.lead_date,
    lead_cost: lead.lead_cost,
  };
}

// ─── Core leads query ─────────────────────────────────────────────────────────

const LEAD_SELECT = `
  id, normalized_phone, agency_id, current_lead_type, current_status,
  first_seen_date, first_contact_date, first_callback_date,
  first_quote_date, first_sold_date, latest_call_date,
  total_call_attempts, total_callbacks, total_voicemails, calls_at_first_quote, calls_at_first_sold,
  has_bad_phone, latest_vendor_name, lead_id_external,
  first_name, last_name, email, street_address, city, state, zip, campaign, lead_date, lead_cost
`;

/**
 * When a staff filter is active, resolve the set of lead_ids that staff has
 * touched in the current date range. Returns null when no staff filter is
 * active (caller should skip the .in() step). Returns an empty array when
 * the staff has no matching events (caller should return [] without querying).
 */
async function resolveStaffLeadIds(
  filters: Filters,
  effectiveAgencyId: string | null,
): Promise<string[] | null> {
  if (!filters.staff || filters.staff === 'all') return null;

  const { from, to } = getDateBounds(filters);
  let q = supabase
    .from('call_events')
    .select('lead_id')
    .eq('staff_id', filters.staff)
    .limit(100000);

  if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
  if (from) q = q.gte('call_date', from);
  if (to) q = q.lte('call_date', to);

  const { data, error } = await q;
  if (error) throw error;
  const ids = new Set<string>();
  for (const ev of data ?? []) if (ev.lead_id) ids.add(ev.lead_id);
  return [...ids];
}

export function useLeads(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['leads', filters, effectiveAgencyId],
    queryFn: async (): Promise<LeadRecord[]> => {
      const { from, to } = getDateBounds(filters);
      const dateField = getDateField(filters.dateBasis);

      const staffLeadIds = await resolveStaffLeadIds(filters, effectiveAgencyId);
      if (staffLeadIds && staffLeadIds.length === 0) return [];

      let query = supabase
        .from('leads')
        .select(LEAD_SELECT)
        .order('first_seen_date', { ascending: false })
        .limit(10000);

      if (effectiveAgencyId) query = query.eq('agency_id', effectiveAgencyId);
      if (staffLeadIds) query = query.in('id', staffLeadIds);

      if (from) query = query.gte(dateField, from);
      // lead_date is a DATE column — don't append a time component
      if (to) query = query.lte(dateField, dateField === 'lead_date' ? to : to + 'T23:59:59');

      if (filters.leadType === 'new') query = query.eq('current_lead_type', 'new_lead');
      else if (filters.leadType === 're_quote') query = query.eq('current_lead_type', 're_quote');

      const { data, error } = await query;
      if (error) throw error;

      let records = (data as LeadRow[]).map(toLeadRecord);

      // Vendor filter — client-side since it depends on compound logic
      if (filters.vendorFilter) {
        records = records.filter((r) => {
          const ct = (r.call_type ?? '').toLowerCase();
          const vn = (r.vendor_name ?? '').toLowerCase();
          const lt = (r.lead_type ?? '').toLowerCase();
          if (lt === 're_quote') return true;
          if ((VENDOR_FILTER_RULES.inboundCallTypes as readonly string[]).some((t) => t.toLowerCase() === ct)) return true;
          return ct.includes(VENDOR_FILTER_RULES.newOutboundSubstring) || vn.includes(VENDOR_FILTER_RULES.newOutboundSubstring);
        });
      }

      return records;
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export function useKPIs(filters: Filters): ReturnType<typeof useLeads> & { kpis: KPIData | undefined } {
  const leadsQuery = useLeads(filters);
  return {
    ...leadsQuery,
    kpis: leadsQuery.data ? calculateKPIs(leadsQuery.data) : undefined,
  };
}

// ─── Contact timing ───────────────────────────────────────────────────────────

export interface ContactTimingRow {
  label: string;
  count: number;
  pct: number;
}

// 9.5x call_type suffixes → day-bucket labels.
// Order matters: longer suffixes first so "9.5a" doesn't match the bare "9.5" rule.
const CALL_TYPE_BUCKETS: { label: string; suffix: string }[] = [
  { label: 'Day 22–30', suffix: '9.5i' },
  { label: 'Day 15–21', suffix: '9.5h' },
  { label: 'Day 8–14',  suffix: '9.5g' },
  { label: 'Day 7',     suffix: '9.5f' },
  { label: 'Day 6',     suffix: '9.5e' },
  { label: 'Day 5',     suffix: '9.5d' },
  { label: 'Day 4',     suffix: '9.5c' },
  { label: 'Day 3',     suffix: '9.5b' },
  { label: 'Day 2',     suffix: '9.5a' },
  { label: 'Day 1',     suffix: '9.5'  },
];

const CONTACT_TIMING_BUCKET_LABELS = [
  'Day 1','Day 2','Day 3','Day 4','Day 5','Day 6','Day 7',
  'Day 8–14','Day 15–21','Day 22–30','No Match',
];

function parseCallTypeBucket(callType: string | null | undefined): string {
  if (!callType) return 'No Match';
  const ct = callType.toLowerCase();
  for (const b of CALL_TYPE_BUCKETS) {
    if (ct.includes(b.suffix)) return b.label;
  }
  return 'No Match';
}

function calcContactTimingFromCallTypes(callTypes: (string | null | undefined)[]): ContactTimingRow[] {
  const counts = new Map<string, number>(CONTACT_TIMING_BUCKET_LABELS.map(l => [l, 0]));
  for (const ct of callTypes) {
    const bucket = parseCallTypeBucket(ct);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const total = callTypes.length;
  return CONTACT_TIMING_BUCKET_LABELS.map(l => ({
    label: l,
    count: counts.get(l) ?? 0,
    pct: total > 0 ? ((counts.get(l) ?? 0) / total) * 100 : 0,
  }));
}

export function useContactTiming(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['contactTiming', filters, effectiveAgencyId],
    queryFn: async (): Promise<ContactTimingRow[]> => {
      const { from, to } = getDateBounds(filters);

      let q = supabase
        .from('call_events')
        .select('lead_id, call_date, call_type')
        .eq('is_contact', true)
        .order('call_date', { ascending: true })
        .limit(100000);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (from) q = q.gte('call_date', from);
      if (to) q = q.lte('call_date', to + 'T23:59:59');

      const { data, error } = await q;
      if (error) throw error;

      // First contact (earliest call_date) per lead. Results are ordered asc, so
      // the first row seen per lead_id is the earliest.
      const firstContactByLead = new Map<string, string>();
      for (const ev of data ?? []) {
        if (!firstContactByLead.has(ev.lead_id)) {
          firstContactByLead.set(ev.lead_id, ev.call_type ?? '');
        }
      }

      return calcContactTimingFromCallTypes([...firstContactByLead.values()]);
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── Staff performance ────────────────────────────────────────────────────────

export interface StaffPerfRow {
  staffId: string;
  name: string;
  leads: number;
  contacts: number;
  callbacks: number;
  voicemails: number;
  voicemailRate: number;
  quoted: number;
  contactRate: number;
  quoteRate: number;
  contactToQuoteRate: number;
  callbackToQuoteRate: number;
  badPhone: number;
  badPhoneRate: number;
}

export function useStaffPerformance(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['staffPerf', filters, effectiveAgencyId],
    queryFn: async (): Promise<StaffPerfRow[]> => {
      const { from, to } = getDateBounds(filters);

      // Fetch call_events with staff info
      let evQ = supabase
        .from('call_events')
        .select('lead_id, staff_id, is_contact, is_callback, is_quote, is_bad_phone, is_voicemail, call_date, agency_id');

      if (effectiveAgencyId) evQ = evQ.eq('agency_id', effectiveAgencyId);
      if (from) evQ = evQ.gte('call_date', from);
      if (to) evQ = evQ.lte('call_date', to);

      const { data: events, error: evErr } = await evQ.limit(50000);
      if (evErr) throw evErr;

      // Fetch staff list
      let smQ = supabase.from('staff_members').select('id, name');
      if (effectiveAgencyId) smQ = smQ.eq('agency_id', effectiveAgencyId);
      const { data: staffList } = await smQ;

      const staffMap = new Map<string, string>(
        (staffList ?? []).map((s) => [s.id, s.name]),
      );

      // Aggregate per-staff, per-unique-lead sets
      type Agg = { leads: Set<string>; contacts: Set<string>; callbacks: Set<string>; quoted: Set<string>; badPhone: Set<string>; voicemailLeads: Set<string>; voicemailCalls: number };
      const byStaff = new Map<string, Agg>();

      for (const ev of events ?? []) {
        if (!ev.staff_id) continue;
        if (!byStaff.has(ev.staff_id)) {
          byStaff.set(ev.staff_id, {
            leads: new Set(), contacts: new Set(), callbacks: new Set(), quoted: new Set(), badPhone: new Set(),
            voicemailLeads: new Set(), voicemailCalls: 0,
          });
        }
        const agg = byStaff.get(ev.staff_id)!;
        agg.leads.add(ev.lead_id);
        if (ev.is_contact) agg.contacts.add(ev.lead_id);
        if (ev.is_callback) agg.callbacks.add(ev.lead_id);
        if (ev.is_quote) agg.quoted.add(ev.lead_id);
        if (ev.is_bad_phone) agg.badPhone.add(ev.lead_id);
        if (ev.is_voicemail) {
          agg.voicemailLeads.add(ev.lead_id);
          agg.voicemailCalls++;
        }
      }

      const results: StaffPerfRow[] = [];
      byStaff.forEach((agg, staffId) => {
        const l = agg.leads.size;
        const c = agg.contacts.size;
        const cb = agg.callbacks.size;
        const q = agg.quoted.size;
        const bp = agg.badPhone.size;
        const vm = agg.voicemailCalls;
        results.push({
          staffId,
          name: staffMap.get(staffId) ?? '(unknown)',
          leads: l,
          contacts: c,
          callbacks: cb,
          voicemails: vm,
          voicemailRate: l > 0 ? vm / l : 0,
          quoted: q,
          contactRate: l > 0 ? c / l : 0,
          quoteRate: l > 0 ? q / l : 0,
          contactToQuoteRate: c > 0 ? q / c : 0,
          callbackToQuoteRate: cb > 0 ? q / cb : 0,
          badPhone: bp,
          badPhoneRate: l > 0 ? bp / l : 0,
        });
      });

      return results.sort((a, b) => b.leads - a.leads);
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── Call quality metrics (from call_events) ──────────────────────────────────

export interface CallQualityMetrics {
  avgDialsBeforeContact: number;
  avgContactCallDurationSec: number;
  /** All call_events in the period */
  totalCallsMade: number;
  /** call_events where call_direction === 'inbound' */
  totalInboundCalls: number;
  /** Total outbound calls in period */
  totalOutboundCalls: number;
  /** Total outbound calls (same as totalOutboundCalls, kept for compatibility) */
  totalOutboundCallsAll: number;
  /** Outbound calls where a voicemail was left */
  voicemailCallCount: number;
  /** voicemailCallCount / totalOutboundCalls */
  voicemailCallRate: number;
  /** Calls with duration >= 5 minutes (300 seconds) */
  callsOver5Min: number;
  /** callsOver5Min / total events */
  callsOver5MinRate: number;
}

export function useCallQuality(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['callQuality', filters, effectiveAgencyId],
    queryFn: async (): Promise<CallQualityMetrics> => {
      const { from, to } = getDateBounds(filters);

      let q = supabase
        .from('call_events')
        .select('lead_id, call_date, call_direction, is_contact, is_voicemail, call_duration_seconds')
        .limit(100000);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (from) q = q.gte('call_date', from);
      if (to) q = q.lte('call_date', to);

      const { data, error } = await q;
      if (error) throw error;

      const events = data ?? [];

      const totalCallsMade = events.length;
      const totalInboundCalls = events.filter(e => e.call_direction === 'inbound').length;

      // Avg duration of calls where contact was made
      const contactEvents = events.filter(e => e.is_contact && (e.call_duration_seconds ?? 0) > 0);
      const avgContactCallDurationSec = contactEvents.length > 0
        ? contactEvents.reduce((sum, e) => sum + (e.call_duration_seconds ?? 0), 0) / contactEvents.length
        : 0;

      // Avg outbound dials before first contact, per lead
      const byLead = new Map<string, typeof events>();
      for (const ev of events) {
        if (!byLead.has(ev.lead_id)) byLead.set(ev.lead_id, []);
        byLead.get(ev.lead_id)!.push(ev);
      }

      let totalDials = 0;
      let leadsWithContact = 0;
      for (const leadEvents of byLead.values()) {
        const sorted = [...leadEvents].sort((a, b) =>
          (a.call_date ?? '').localeCompare(b.call_date ?? ''),
        );
        const firstContactIdx = sorted.findIndex(e => e.is_contact);
        if (firstContactIdx === -1) continue;
        totalDials += sorted.slice(0, firstContactIdx).filter(e => e.call_direction === 'outbound').length;
        leadsWithContact++;
      }

      // Voicemail call rate (outbound only)
      const outboundEvents = events.filter(e => e.call_direction === 'outbound');
      const totalOutboundCalls = outboundEvents.length;
      const voicemailCallCount = outboundEvents.filter(e => e.is_voicemail).length;
      const voicemailCallRate = totalOutboundCalls > 0 ? voicemailCallCount / totalOutboundCalls : 0;

      const callsOver5Min = events.filter(e => (e.call_duration_seconds ?? 0) >= 300).length;
      const callsOver5MinRate = events.length > 0 ? callsOver5Min / events.length : 0;

      return {
        avgDialsBeforeContact: leadsWithContact > 0 ? totalDials / leadsWithContact : 0,
        avgContactCallDurationSec,
        totalCallsMade,
        totalInboundCalls,
        totalOutboundCalls,
        totalOutboundCallsAll: totalOutboundCalls,
        voicemailCallCount,
        voicemailCallRate,
        callsOver5Min,
        callsOver5MinRate,
      };
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── Daily trends (calls / contacts / voicemails / callbacks per day) ─────────

export interface DailyTrendRow {
  date: string;
  totalCalls: number;
  contacts: number;
  voicemails: number;
  callbacks: number;
}

export function useDailyTrends(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['dailyTrends', filters, effectiveAgencyId],
    queryFn: async (): Promise<DailyTrendRow[]> => {
      const { from, to } = getDateBounds(filters);

      let q = supabase
        .from('call_events')
        .select('call_date, is_contact, is_voicemail, is_callback')
        .limit(100000);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (from) q = q.gte('call_date', from);
      if (to) q = q.lte('call_date', to);

      const { data, error } = await q;
      if (error) throw error;

      const byDate = new Map<string, DailyTrendRow>();
      for (const ev of data ?? []) {
        if (!ev.call_date) continue;
        if (!byDate.has(ev.call_date)) {
          byDate.set(ev.call_date, { date: ev.call_date, totalCalls: 0, contacts: 0, voicemails: 0, callbacks: 0 });
        }
        const row = byDate.get(ev.call_date)!;
        row.totalCalls++;
        if (ev.is_contact) row.contacts++;
        if (ev.is_voicemail) row.voicemails++;
        if (ev.is_callback) row.callbacks++;
      }

      return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── Upload history ───────────────────────────────────────────────────────────

export function useUploadHistory() {
  const { agencyId, isAdmin } = useAuth();

  return useQuery({
    queryKey: ['uploads', agencyId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from('uploads')
        .select('id, file_name, report_type, upload_date, row_count, matched_count, status, notes, agency_id, created_at, batch_id')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!isAdmin && agencyId) q = q.eq('agency_id', agencyId);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Agencies ─────────────────────────────────────────────────────────────────

export function useAgencies() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ['agencies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agencies').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });
}

// ─── Staff members ────────────────────────────────────────────────────────────

export function useStaffMembers() {
  const { agencyId, isAdmin } = useAuth();

  return useQuery({
    queryKey: ['staffMembers', agencyId, isAdmin],
    queryFn: async () => {
      let q = supabase.from('staff_members').select('id, name, agency_id').order('name');
      if (!isAdmin && agencyId) q = q.eq('agency_id', agencyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin ? true : !!agencyId,
  });
}

// ─── Lead list (for LeadExplorer) ─────────────────────────────────────────────

export interface LeadListRow {
  id: string;
  phone: string;
  leadIdExternal: string | null;
  leadType: string;
  status: string;
  firstSeen: string | null;
  firstContact: string | null;
  firstQuote: string | null;
  calls: number;
  callbacks: number;
  vendor: string | null;
  isBadPhone: boolean;
  name: string | null;
  email: string | null;
  address: string | null;
  campaign: string | null;
  leadCost: number | null;
}

export function useLeadList(filters: Filters & { search?: string }) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['leadList', filters, effectiveAgencyId],
    queryFn: async (): Promise<LeadListRow[]> => {
      const { from, to } = getDateBounds(filters);
      const dateField = getDateField(filters.dateBasis);

      const staffLeadIds = await resolveStaffLeadIds(filters, effectiveAgencyId);
      if (staffLeadIds && staffLeadIds.length === 0) return [];

      let q = supabase
        .from('leads')
        .select(LEAD_SELECT)
        .order('first_seen_date', { ascending: false })
        .limit(500);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (staffLeadIds) q = q.in('id', staffLeadIds);
      if (from) q = q.gte(dateField, from);
      if (to) q = q.lte(dateField, dateField === 'lead_date' ? to : to + 'T23:59:59');
      if (filters.leadType === 'new') q = q.eq('current_lead_type', 'new_lead');
      else if (filters.leadType === 're_quote') q = q.eq('current_lead_type', 're_quote');

      const { data, error } = await q;
      if (error) throw error;

      return (data as LeadRow[]).map((l) => ({
        id: l.id,
        phone: l.normalized_phone,
        leadIdExternal: l.lead_id_external,
        leadType: l.current_lead_type ?? 'new_lead',
        status: l.current_status ?? '',
        firstSeen: l.first_seen_date ? l.first_seen_date.split('T')[0] : null,
        firstContact: l.first_contact_date ? l.first_contact_date.split('T')[0] : null,
        firstQuote: l.first_quote_date ? l.first_quote_date.split('T')[0] : null,
        calls: l.total_call_attempts ?? 0,
        callbacks: l.total_callbacks ?? 0,
        vendor: l.latest_vendor_name,
        isBadPhone: l.has_bad_phone ?? false,
        name: [l.first_name, l.last_name].filter(Boolean).join(' ') || null,
        email: l.email,
        address: [l.street_address, l.city, l.state].filter(Boolean).join(', ') || null,
        campaign: l.campaign,
        leadCost: l.lead_cost,
      }));
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── Sales data ───────────────────────────────────────────────────────────────

export interface SalesEventRow {
  id: string;
  sale_id: string;
  sale_date: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  lead_source: string | null;
  producer: string | null;
  staff_id: string | null;
  policy_type: string | null;
  policy_number: string | null;
  items: number;
  premium: number;
  points: number;
  lead_id: string | null;
}

export interface SalesProducerRow {
  name: string;
  staffId: string | null;
  households: number;
  items: number;
  policies: number;
  premium: number;
  avgPremiumPerHousehold: number;
}

export interface SalesPolicyTypeRow {
  policyType: string;
  count: number;
  totalItems: number;
  totalPremium: number;
}

export interface SalesKPIs {
  totalHouseholds: number;
  totalItems: number;
  totalPolicies: number;
  totalPremium: number;
  avgItemsPerHousehold: number;
  avgPoliciesPerHousehold: number;
  pctHomeAndAuto: number;
}

export interface SalesData {
  kpis: SalesKPIs;
  byProducer: SalesProducerRow[];
  byPolicyType: SalesPolicyTypeRow[];
  raw: SalesEventRow[];
}

export function useSalesData(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['salesData', filters, effectiveAgencyId],
    queryFn: async (): Promise<SalesData> => {
      const { from, to } = getDateBounds(filters);

      let q = supabase
        .from('sales_events')
        .select('id, sale_id, sale_date, customer_name, customer_phone, lead_source, producer, staff_id, policy_type, policy_number, items, premium, points, lead_id')
        .limit(50000);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (from) q = q.gte('sale_date', from);
      if (to) q = q.lte('sale_date', to);

      const { data, error } = await q;
      if (error) throw error;

      const events = (data ?? []) as SalesEventRow[];

      // Staff name lookup
      let smQ = supabase.from('staff_members').select('id, name');
      if (effectiveAgencyId) smQ = smQ.eq('agency_id', effectiveAgencyId);
      const { data: staffList } = await smQ;
      const staffNameMap = new Map<string, string>((staffList ?? []).map((s) => [s.id, s.name]));

      // ── KPIs ────────────────────────────────────────────────────────────
      const householdMap = new Map<string, SalesEventRow[]>();
      for (const ev of events) {
        if (!householdMap.has(ev.sale_id)) householdMap.set(ev.sale_id, []);
        householdMap.get(ev.sale_id)!.push(ev);
      }

      const totalHouseholds = householdMap.size;
      const totalItems = events.reduce((s, e) => s + (e.items ?? 1), 0);
      const totalPolicies = events.length;
      const totalPremium = events.reduce((s, e) => s + (Number(e.premium) || 0), 0);

      // Households with both Home Insurance and Auto Insurance
      let homeAndAutoCount = 0;
      for (const rows of householdMap.values()) {
        const types = new Set(rows.map((r) => (r.policy_type ?? '').toLowerCase()));
        if (types.has('home insurance') && types.has('auto insurance')) homeAndAutoCount++;
      }

      const kpis: SalesKPIs = {
        totalHouseholds,
        totalItems,
        totalPolicies,
        totalPremium,
        avgItemsPerHousehold: totalHouseholds > 0 ? totalItems / totalHouseholds : 0,
        avgPoliciesPerHousehold: totalHouseholds > 0 ? totalPolicies / totalHouseholds : 0,
        pctHomeAndAuto: totalHouseholds > 0 ? (homeAndAutoCount / totalHouseholds) * 100 : 0,
      };

      // ── By Producer ─────────────────────────────────────────────────────
      type ProdAgg = { staffId: string | null; households: Set<string>; items: number; policies: number; premium: number };
      const byProducerMap = new Map<string, ProdAgg>();

      for (const ev of events) {
        const key = ev.producer ?? '(Unknown)';
        if (!byProducerMap.has(key)) {
          byProducerMap.set(key, { staffId: ev.staff_id, households: new Set(), items: 0, policies: 0, premium: 0 });
        }
        const agg = byProducerMap.get(key)!;
        agg.households.add(ev.sale_id);
        agg.items += ev.items ?? 1;
        agg.policies += 1;
        agg.premium += Number(ev.premium) || 0;
      }

      const byProducer: SalesProducerRow[] = [...byProducerMap.entries()].map(([name, agg]) => ({
        name: agg.staffId ? (staffNameMap.get(agg.staffId) ?? name) : name,
        staffId: agg.staffId,
        households: agg.households.size,
        items: agg.items,
        policies: agg.policies,
        premium: agg.premium,
        avgPremiumPerHousehold: agg.households.size > 0 ? agg.premium / agg.households.size : 0,
      })).sort((a, b) => b.premium - a.premium);

      // ── By Policy Type ──────────────────────────────────────────────────
      type TypeAgg = { count: number; totalItems: number; totalPremium: number };
      const byTypeMap = new Map<string, TypeAgg>();

      for (const ev of events) {
        const key = ev.policy_type ?? '(Unknown)';
        if (!byTypeMap.has(key)) byTypeMap.set(key, { count: 0, totalItems: 0, totalPremium: 0 });
        const agg = byTypeMap.get(key)!;
        agg.count += 1;
        agg.totalItems += ev.items ?? 1;
        agg.totalPremium += Number(ev.premium) || 0;
      }

      const byPolicyType: SalesPolicyTypeRow[] = [...byTypeMap.entries()].map(([policyType, agg]) => ({
        policyType,
        count: agg.count,
        totalItems: agg.totalItems,
        totalPremium: agg.totalPremium,
      })).sort((a, b) => b.totalPremium - a.totalPremium);

      return { kpis, byProducer, byPolicyType, raw: events };
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── ROI data ─────────────────────────────────────────────────────────────────

export interface ROIMetrics {
  totalLeadSpend: number;
  totalLeads: number;
  totalHouseholdsSold: number;
  totalPremium: number;
  totalQuotedHouseholds: number;
  totalContactedLeads: number;
  costPerLead: number;
  costPerQuotedHousehold: number;
  costPerSoldHousehold: number;
  costPerConversation: number;
  avgItemsPerSoldHousehold: number;
  avgPoliciesPerSoldHousehold: number;
  pctHomeAndAuto: number;
  roiPct: number;
}

export interface ROICampaignRow {
  campaign: string;
  leads: number;
  spend: number;
  contacted: number;
  quoted: number;
  sold: number;
  premium: number;
  costPerLead: number;
  costPerSold: number;
  roiPct: number;
}

export interface ROIData {
  metrics: ROIMetrics;
  byCampaign: ROICampaignRow[];
}

export function useROIData(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['roiData', filters, effectiveAgencyId],
    queryFn: async (): Promise<ROIData> => {
      const { from, to } = getDateBounds(filters);

      // ── Leads data ───────────────────────────────────────────────────────
      // ROI always scopes by first_seen_date (when the lead entered the system)
      let leadsQ = supabase
        .from('leads')
        .select('id, lead_cost, campaign, first_seen_date, first_contact_date, first_quote_date, first_sold_date')
        .limit(50000);

      if (effectiveAgencyId) leadsQ = leadsQ.eq('agency_id', effectiveAgencyId);
      if (from) leadsQ = leadsQ.gte('first_seen_date', from);
      if (to) leadsQ = leadsQ.lte('first_seen_date', to + 'T23:59:59');

      const { data: leadsData, error: leadsErr } = await leadsQ;
      if (leadsErr) throw leadsErr;

      const leads = leadsData ?? [];

      // ── Sales events data ────────────────────────────────────────────────
      let salesQ = supabase
        .from('sales_events')
        .select('sale_id, policy_type, items, premium')
        .limit(50000);

      if (effectiveAgencyId) salesQ = salesQ.eq('agency_id', effectiveAgencyId);
      if (from) salesQ = salesQ.gte('sale_date', from);
      if (to) salesQ = salesQ.lte('sale_date', to);

      const { data: salesData, error: salesErr } = await salesQ;
      if (salesErr) throw salesErr;

      const salesEvents = salesData ?? [];

      // ── Aggregate metrics ────────────────────────────────────────────────
      const totalLeadSpend = leads.reduce((s, l) => s + (Number(l.lead_cost) || 0), 0);
      const totalLeads = leads.length;
      const totalContactedLeads = leads.filter((l) => l.first_contact_date != null).length;
      const totalQuotedHouseholds = leads.filter((l) => l.first_quote_date != null).length;

      // Sales households
      const householdMap = new Map<string, typeof salesEvents>();
      for (const ev of salesEvents) {
        if (!householdMap.has(ev.sale_id)) householdMap.set(ev.sale_id, []);
        householdMap.get(ev.sale_id)!.push(ev);
      }
      const totalHouseholdsSold = householdMap.size;
      const totalPremium = salesEvents.reduce((s, e) => s + (Number(e.premium) || 0), 0);

      let totalItemsSold = 0;
      let totalPoliciesSold = 0;
      let homeAndAutoCount = 0;
      for (const rows of householdMap.values()) {
        const items = rows.reduce((s, r) => s + (r.items ?? 1), 0);
        totalItemsSold += items;
        totalPoliciesSold += rows.length;
        const types = new Set(rows.map((r) => (r.policy_type ?? '').toLowerCase()));
        if (types.has('home insurance') && types.has('auto insurance')) homeAndAutoCount++;
      }

      const metrics: ROIMetrics = {
        totalLeadSpend,
        totalLeads,
        totalHouseholdsSold,
        totalPremium,
        totalQuotedHouseholds,
        totalContactedLeads,
        costPerLead: totalLeads > 0 ? totalLeadSpend / totalLeads : 0,
        costPerQuotedHousehold: totalQuotedHouseholds > 0 ? totalLeadSpend / totalQuotedHouseholds : 0,
        costPerSoldHousehold: totalHouseholdsSold > 0 ? totalLeadSpend / totalHouseholdsSold : 0,
        costPerConversation: totalContactedLeads > 0 ? totalLeadSpend / totalContactedLeads : 0,
        avgItemsPerSoldHousehold: totalHouseholdsSold > 0 ? totalItemsSold / totalHouseholdsSold : 0,
        avgPoliciesPerSoldHousehold: totalHouseholdsSold > 0 ? totalPoliciesSold / totalHouseholdsSold : 0,
        pctHomeAndAuto: totalHouseholdsSold > 0 ? (homeAndAutoCount / totalHouseholdsSold) * 100 : 0,
        roiPct: totalLeadSpend > 0 ? (totalPremium / totalLeadSpend) * 100 : 0,
      };

      // ── By Campaign ──────────────────────────────────────────────────────
      type CampAgg = {
        leads: number;
        spend: number;
        contacted: number;
        quoted: number;
        sold: number;
      };
      const byCampaignMap = new Map<string, CampAgg>();

      for (const lead of leads) {
        const key = lead.campaign ?? '(No Campaign)';
        if (!byCampaignMap.has(key)) {
          byCampaignMap.set(key, { leads: 0, spend: 0, contacted: 0, quoted: 0, sold: 0 });
        }
        const agg = byCampaignMap.get(key)!;
        agg.leads++;
        agg.spend += Number(lead.lead_cost) || 0;
        if (lead.first_contact_date) agg.contacted++;
        if (lead.first_quote_date) agg.quoted++;
        if (lead.first_sold_date) agg.sold++;
      }

      const byCampaign: ROICampaignRow[] = [...byCampaignMap.entries()].map(([campaign, agg]) => {
        // Estimate premium for this campaign (proportional split not perfect but workable)
        const campPremium = totalLeads > 0 ? (agg.leads / totalLeads) * totalPremium : 0;
        return {
          campaign,
          leads: agg.leads,
          spend: agg.spend,
          contacted: agg.contacted,
          quoted: agg.quoted,
          sold: agg.sold,
          premium: campPremium,
          costPerLead: agg.leads > 0 ? agg.spend / agg.leads : 0,
          costPerSold: agg.sold > 0 ? agg.spend / agg.sold : 0,
          roiPct: agg.spend > 0 ? (campPremium / agg.spend) * 100 : 0,
        };
      }).sort((a, b) => b.spend - a.spend);

      return { metrics, byCampaign };
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── Total call metrics (dashboard KPI tiles) ─────────────────────────────────────

export interface TotalCallMetrics {
  totalCallsMade: number;
  totalInbound: number;
}

export function useTotalCallMetrics(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['totalCallMetrics', filters, effectiveAgencyId],
    queryFn: async (): Promise<TotalCallMetrics> => {
      const { from, to } = getDateBounds(filters);

      let q = supabase
        .from('call_events')
        .select('call_direction')
        .limit(200000);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (from) q = q.gte('call_date', from);
      if (to) q = q.lte('call_date', to + 'T23:59:59');

      const { data, error } = await q;
      if (error) throw error;

      const rows = data ?? [];
      return {
        totalCallsMade: rows.length,
        totalInbound: rows.filter(r => r.call_direction === 'inbound').length,
      };
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}

// ─── Sold summary (for dashboard card) ─────────────────────────────────────────────

export interface SoldSummary {
  householdsSold: number;
  itemsSold: number;
  policiesSold: number;
  totalPremium: number;
}

export function useSoldSummary(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['soldSummary', filters, effectiveAgencyId],
    queryFn: async (): Promise<SoldSummary> => {
      const { from, to } = getDateBounds(filters);

      let q = supabase
        .from('sales_events')
        .select('sale_id, items, premium')
        .limit(100000);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (from) q = q.gte('sale_date', from);
      if (to) q = q.lte('sale_date', to);

      const { data, error } = await q;
      if (error) throw error;

      const events = data ?? [];
      const households = new Set(events.map(e => e.sale_id));
      const itemsSold = events.reduce((s, e) => s + (e.items ?? 1), 0);
      const totalPremium = events.reduce((s, e) => s + (Number(e.premium) || 0), 0);

      return {
        householdsSold: households.size,
        itemsSold,
        policiesSold: events.length,
        totalPremium,
      };
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}
