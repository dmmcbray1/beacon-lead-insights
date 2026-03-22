/**
 * Centralized metric calculation functions.
 * All KPI definitions live here for easy maintenance.
 */

import {
  CONTACT_DISPOSITIONS,
  QUOTE_DISPOSITIONS,
  SOLD_DISPOSITIONS,
  BAD_PHONE_STATUSES,
  VENDOR_FILTER_RULES,
} from './constants';

export interface LeadRecord {
  id: string;
  normalized_phone: string;
  agency_id: string;
  lead_type: string | null;
  current_status: string | null;
  first_seen_date: string | null;
  first_contact_date: string | null;
  first_callback_date: string | null;
  first_quote_date: string | null;
  first_sold_date: string | null;
  total_call_attempts: number;
  total_callbacks: number;
  /** Total Calls from Deer Dama, captured when lead first reaches a quote status */
  calls_at_first_quote: number | null;
  /** Total Calls from Deer Dama, captured when lead first reaches sold status */
  calls_at_first_sold: number | null;
  has_bad_phone: boolean;
  statuses: string[];
  /** The Call Type value from Daily Call Report (contains campaign/territory info) */
  call_type: string | null;
  /** The Vendor Name column value */
  vendor_name: string | null;
}

// ---------------------------------------------------------------------------
// Status classification helpers
// ---------------------------------------------------------------------------

function matchesAny(value: string, list: readonly string[]): boolean {
  const v = value.trim().toLowerCase();
  return list.some(d => d.toLowerCase() === v);
}

export function isContact(statuses: string[]): boolean {
  return statuses.some(s => matchesAny(s, CONTACT_DISPOSITIONS));
}

export function isQuoted(statuses: string[]): boolean {
  return statuses.some(s => matchesAny(s, QUOTE_DISPOSITIONS));
}

export function isSold(statuses: string[]): boolean {
  return statuses.some(s => matchesAny(s, SOLD_DISPOSITIONS));
}

export function isBadPhone(statuses: string[]): boolean {
  return statuses.some(s => matchesAny(s, BAD_PHONE_STATUSES));
}

// ---------------------------------------------------------------------------
// Call direction resolution (substring-based for complex Call Type strings)
// ---------------------------------------------------------------------------

/**
 * Determines call direction from the Call Type string.
 * "Inbound Call" and "Inbound IVR" → inbound; everything else → outbound.
 */
export function resolveCallDirection(callType: string | null): 'inbound' | 'outbound' {
  if (!callType) return 'outbound';
  const ct = callType.trim().toLowerCase();
  if (ct === 'inbound call' || ct === 'inbound ivr') return 'inbound';
  return 'outbound';
}

/**
 * Resolves the lead phone number from a Daily Call row.
 * Outbound → To field; Inbound → From field.
 */
export function resolveLeadPhone(
  callType: string | null,
  fromNumber: string | null,
  toNumber: string | null,
): string | null {
  const direction = resolveCallDirection(callType);
  return direction === 'inbound' ? (fromNumber || null) : (toNumber || null);
}

// ---------------------------------------------------------------------------
// Vendor / territory filter
// ---------------------------------------------------------------------------

/**
 * Checks whether a lead's call data passes the vendor territory filter.
 *
 * Filter rules (based on Call Type field, NOT Vendor Name):
 *   New outbound  → Call Type contains "beacon territory"
 *   New inbound   → Call Type is "Inbound Call" or "Inbound IVR"
 *   Re-quote      → Call Type or Vendor Name contains "requote"
 */
export function passesVendorFilter(lead: LeadRecord): boolean {
  const callType = (lead.call_type || '').toLowerCase();
  const vendorName = (lead.vendor_name || '').toLowerCase();
  const leadType = (lead.lead_type || '').toLowerCase();

  // Re-quote leads: Call Type or Vendor Name must contain "requote"
  if (leadType === 're_quote' || leadType === 're-quote') {
    return (
      callType.includes(VENDOR_FILTER_RULES.reQuoteSubstring) ||
      vendorName.includes(VENDOR_FILTER_RULES.reQuoteSubstring)
    );
  }

  // New leads — check if inbound type
  if ((VENDOR_FILTER_RULES.inboundCallTypes as readonly string[]).includes(callType)) {
    return true; // All "Inbound Call" / "Inbound IVR" rows pass
  }

  // New leads — outbound must contain "beacon territory" in Call Type
  return callType.includes(VENDOR_FILTER_RULES.newOutboundSubstring);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function calcRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// KPI calculation
// ---------------------------------------------------------------------------

export interface KPIData {
  totalLeads: number;
  newLeads: number;
  reQuoteLeads: number;
  totalContacts: number;
  totalQuotedHouseholds: number;
  totalCallbacks: number;
  badPhoneCount: number;
  contactRate: number;
  quoteRate: number;
  contactToQuoteRate: number;
  callbackToQuoteRate: number;
  avgCallsToQuote: number;
  avgDaysToQuote: number;
  avgDaysToSoldFromSeen: number;
  avgDaysToSoldFromContact: number;
  /** Days from first_quote_date → first_sold_date */
  avgDaysQuoteToSold: number;
  /** Difference in Total Calls between first sold and first quote snapshots */
  avgCallsQuoteToSold: number;
  badPhoneRate: number;
  badPhoneNewCount: number;
  badPhoneNewRate: number;
  badPhoneReQuoteCount: number;
  badPhoneReQuoteRate: number;
}

export function calculateKPIs(leads: LeadRecord[], applyVendorFilter = false): KPIData {
  const filtered = applyVendorFilter ? leads.filter(passesVendorFilter) : leads;
  const totalLeads = filtered.length;
  const newLeads = filtered.filter(l => l.lead_type === 'new_lead').length;
  const reQuoteLeads = filtered.filter(l => l.lead_type === 're_quote').length;

  const contactedLeads = filtered.filter(l => isContact(l.statuses));
  const totalContacts = contactedLeads.length;

  const quotedLeads = filtered.filter(l => isQuoted(l.statuses));
  const totalQuotedHouseholds = quotedLeads.length;

  const totalCallbacks = filtered.filter(l => l.total_callbacks > 0).length;
  const badPhoneCount = filtered.filter(l => l.has_bad_phone).length;

  const contactRate = calcRate(totalContacts, totalLeads);
  const quoteRate = calcRate(totalQuotedHouseholds, totalLeads);

  const contactedAndQuoted = contactedLeads.filter(l => isQuoted(l.statuses)).length;
  const contactToQuoteRate = calcRate(contactedAndQuoted, totalContacts);

  const callbackLeads = filtered.filter(l => l.total_callbacks > 0);
  const callbackQuoted = callbackLeads.filter(l => isQuoted(l.statuses)).length;
  const callbackToQuoteRate = calcRate(callbackQuoted, callbackLeads.length);

  // Average calls to quote — uses calls_at_first_quote (Deer Dama Total Calls
  // captured at the moment the lead first reached a quote status).
  // Falls back to total_call_attempts if calls_at_first_quote is not available.
  const quotedWithCalls = quotedLeads.filter(l => (l.calls_at_first_quote ?? l.total_call_attempts) > 0);
  const avgCallsToQuote = quotedWithCalls.length > 0
    ? quotedWithCalls.reduce((sum, l) => sum + (l.calls_at_first_quote ?? l.total_call_attempts), 0) / quotedWithCalls.length
    : 0;

  // Average days to quote (first seen → first quote)
  const quotedWithDates = quotedLeads.filter(l => l.first_seen_date && l.first_quote_date);
  const avgDaysToQuote = quotedWithDates.length > 0
    ? quotedWithDates.reduce((sum, l) => {
        const start = new Date(l.first_seen_date!).getTime();
        const end = new Date(l.first_quote_date!).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      }, 0) / quotedWithDates.length
    : 0;

  // Average days to sold (first seen → first sold)
  const soldLeads = filtered.filter(l => isSold(l.statuses));
  const soldWithSeenDates = soldLeads.filter(l => l.first_seen_date && l.first_sold_date);
  const avgDaysToSoldFromSeen = soldWithSeenDates.length > 0
    ? soldWithSeenDates.reduce((sum, l) => {
        const start = new Date(l.first_seen_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      }, 0) / soldWithSeenDates.length
    : 0;

  // Average days to sold (first contact → first sold)
  const soldWithContactDates = soldLeads.filter(l => l.first_contact_date && l.first_sold_date);
  const avgDaysToSoldFromContact = soldWithContactDates.length > 0
    ? soldWithContactDates.reduce((sum, l) => {
        const start = new Date(l.first_contact_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      }, 0) / soldWithContactDates.length
    : 0;

  // Average days from quote to sold (first_quote_date → first_sold_date)
  const soldWithQuoteDates = soldLeads.filter(l => l.first_quote_date && l.first_sold_date);
  const avgDaysQuoteToSold = soldWithQuoteDates.length > 0
    ? soldWithQuoteDates.reduce((sum, l) => {
        const start = new Date(l.first_quote_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      }, 0) / soldWithQuoteDates.length
    : 0;

  // Average calls from quote to sold (calls_at_first_sold − calls_at_first_quote)
  const soldWithCallSnapshots = soldLeads.filter(
    l => l.calls_at_first_sold != null && l.calls_at_first_quote != null
  );
  const avgCallsQuoteToSold = soldWithCallSnapshots.length > 0
    ? soldWithCallSnapshots.reduce(
        (sum, l) => sum + Math.max(0, l.calls_at_first_sold! - l.calls_at_first_quote!), 0
      ) / soldWithCallSnapshots.length
    : 0;

  return {
    totalLeads, newLeads, reQuoteLeads,
    totalContacts, totalQuotedHouseholds, totalCallbacks, badPhoneCount,
    contactRate, quoteRate, contactToQuoteRate, callbackToQuoteRate,
    avgCallsToQuote, avgDaysToQuote, avgDaysToSoldFromSeen, avgDaysToSoldFromContact,
    avgDaysQuoteToSold, avgCallsQuoteToSold,
  };
}
