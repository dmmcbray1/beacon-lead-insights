/**
 * TanStack Query hooks that fetch real data from Supabase and replace all
 * seed/mock data calls in the application pages.
 */

import { useQuery } from '@tanstack/react-query';
import { subDays, startOfYear, format } from 'date-fns';
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
  dateRange: string;   // 'today' | '7d' | '30d' | '90d' | 'ytd' | 'all'
  agency: string;      // 'all' or agency UUID
  staff: string;       // 'all' or staff UUID
  leadType: string;    // 'all' | 'new' | 're_quote'
  dateBasis: string;   // 'lead_created' | 'call_date' | 'first_contact' | 'first_quote' | 'callback_date'
  vendorFilter?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateBounds(dateRange: string): { from: string | null; to: string | null } {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  switch (dateRange) {
    case 'today': return { from: today, to: today };
    case '7d':    return { from: format(subDays(now, 7), 'yyyy-MM-dd'), to: today };
    case '30d':   return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: today };
    case '90d':   return { from: format(subDays(now, 90), 'yyyy-MM-dd'), to: today };
    case 'ytd':   return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: today };
    default:      return { from: null, to: null };
  }
}

function getDateField(dateBasis: string): string {
  switch (dateBasis) {
    case 'call_date':      return 'latest_call_date';
    case 'first_contact':  return 'first_contact_date';
    case 'first_quote':    return 'first_quote_date';
    case 'callback_date':  return 'first_callback_date';
    default:               return 'first_seen_date';
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
    latest_call_date: lead.latest_call_date,
    statuses: buildStatuses(lead),
    call_type: buildCallType(lead),
    vendor_name: lead.latest_vendor_name,
  };
}

// ─── Core leads query ─────────────────────────────────────────────────────────

const LEAD_SELECT = `
  id, normalized_phone, agency_id, current_lead_type, current_status,
  first_seen_date, first_contact_date, first_callback_date,
  first_quote_date, first_sold_date, latest_call_date,
  total_call_attempts, total_callbacks, total_voicemails, calls_at_first_quote, calls_at_first_sold,
  has_bad_phone, latest_vendor_name, lead_id_external
`;

export function useLeads(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['leads', filters, effectiveAgencyId],
    queryFn: async (): Promise<LeadRecord[]> => {
      const { from, to } = getDateBounds(filters.dateRange);
      const dateField = getDateField(filters.dateBasis);

      let query = supabase
        .from('leads')
        .select(LEAD_SELECT)
        .order('first_seen_date', { ascending: false })
        .limit(10000);

      if (effectiveAgencyId) query = query.eq('agency_id', effectiveAgencyId);

      if (from) query = query.gte(dateField, from);
      if (to) query = query.lte(dateField, to + 'T23:59:59');

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

const TIMING_BUCKETS = [
  { label: 'Day 0',     min: 0,  max: 0 },
  { label: 'Day 1',     min: 1,  max: 1 },
  { label: 'Day 2–7',   min: 2,  max: 7 },
  { label: 'Day 8–31',  min: 8,  max: 31 },
  { label: '31+ Days',  min: 32, max: Infinity },
];

function calcContactTiming(leads: LeadRecord[]): ContactTimingRow[] {
  const total = leads.length;
  const counts: number[] = new Array(TIMING_BUCKETS.length + 1).fill(0); // +1 for "never"

  for (const lead of leads) {
    if (!lead.first_seen_date || !lead.first_contact_date) {
      counts[TIMING_BUCKETS.length]++;
      continue;
    }
    const days = Math.max(
      0,
      Math.round(
        (new Date(lead.first_contact_date).getTime() - new Date(lead.first_seen_date).getTime()) / 86_400_000,
      ),
    );
    const idx = TIMING_BUCKETS.findIndex((b) => days >= b.min && days <= b.max);
    if (idx >= 0) counts[idx]++;
    else counts[TIMING_BUCKETS.length]++;
  }

  const rows: ContactTimingRow[] = TIMING_BUCKETS.map((b, i) => ({
    label: b.label,
    count: counts[i],
    pct: total > 0 ? (counts[i] / total) * 100 : 0,
  }));

  rows.push({
    label: 'Never',
    count: counts[TIMING_BUCKETS.length],
    pct: total > 0 ? (counts[TIMING_BUCKETS.length] / total) * 100 : 0,
  });

  return rows;
}

export function useContactTiming(filters: Filters) {
  const leadsQuery = useLeads(filters);
  return {
    ...leadsQuery,
    timing: leadsQuery.data ? calcContactTiming(leadsQuery.data) : undefined,
  };
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
      const { from, to } = getDateBounds(filters.dateRange);

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
        if ((ev as any).is_voicemail) {
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
  /** Total outbound calls in period */
  totalOutboundCalls: number;
  /** Outbound calls where a voicemail was left */
  voicemailCallCount: number;
  /** voicemailCallCount / totalOutboundCalls */
  voicemailCallRate: number;
}

export function useCallQuality(filters: Filters) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['callQuality', filters, effectiveAgencyId],
    queryFn: async (): Promise<CallQualityMetrics> => {
      const { from, to } = getDateBounds(filters.dateRange);

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
      const voicemailCallCount = outboundEvents.filter(e => (e as any).is_voicemail).length;
      const voicemailCallRate = totalOutboundCalls > 0 ? voicemailCallCount / totalOutboundCalls : 0;

      return {
        avgDialsBeforeContact: leadsWithContact > 0 ? totalDials / leadsWithContact : 0,
        avgContactCallDurationSec,
        totalOutboundCalls,
        voicemailCallCount,
        voicemailCallRate,
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
      const { from, to } = getDateBounds(filters.dateRange);

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
        if ((ev as any).is_voicemail) row.voicemails++;
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
        .select('id, file_name, report_type, upload_date, row_count, matched_count, status, notes, agency_id, created_at')
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
}

export function useLeadList(filters: Filters & { search?: string }) {
  const { agencyId, isAdmin } = useAuth();
  const effectiveAgencyId = isAdmin ? (filters.agency !== 'all' ? filters.agency : null) : agencyId;

  return useQuery({
    queryKey: ['leadList', filters, effectiveAgencyId],
    queryFn: async (): Promise<LeadListRow[]> => {
      const { from, to } = getDateBounds(filters.dateRange);
      const dateField = getDateField(filters.dateBasis);

      let q = supabase
        .from('leads')
        .select(LEAD_SELECT)
        .order('first_seen_date', { ascending: false })
        .limit(500);

      if (effectiveAgencyId) q = q.eq('agency_id', effectiveAgencyId);
      if (from) q = q.gte(dateField, from);
      if (to) q = q.lte(dateField, to + 'T23:59:59');
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
        firstSeen: l.first_seen_date,
        firstContact: l.first_contact_date,
        firstQuote: l.first_quote_date,
        calls: l.total_call_attempts ?? 0,
        callbacks: l.total_callbacks ?? 0,
        vendor: l.latest_vendor_name,
        isBadPhone: l.has_bad_phone ?? false,
      }));
    },
    enabled: isAdmin ? true : !!agencyId,
    staleTime: 30_000,
  });
}
