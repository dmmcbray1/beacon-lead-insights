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

export function isDoNotCall(statuses: string[]): boolean {
  return statuses.some(s =>
    s.trim().toLowerCase() === 'xx - do not call - xx'
  );
}

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
  is_do_not_call: boolean;
  latest_call_date: string | null;
  total_voicemails: number;
  statuses: string[];
  /** The Call Type value from Daily Call Report (contains campaign/territory info) */
  call_type: string | null;
  /** The Vendor Name column value */
  vendor_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  campaign?: string | null;
  lead_date?: string | null;
  lead_cost?: number | null;
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

/**
 * A lead is considered "contacted" if it has a contact disposition OR has callbacks.
 * Callbacks always count as a contact.
 */
export function isContacted(lead: LeadRecord): boolean {
  return isContact(lead.statuses) || lead.total_callbacks > 0;
}

// ---------------------------------------------------------------------------
// Call direction resolution
// ---------------------------------------------------------------------------

export function resolveCallDirection(callType: string | null): 'inbound' | 'outbound' {
  if (!callType) return 'outbound';
  const ct = callType.trim().toLowerCase();
  if (ct === 'inbound call' || ct === 'inbound ivr') return 'inbound';
  return 'outbound';
}

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

export function passesVendorFilter(lead: LeadRecord): boolean {
  const callType = (lead.call_type || '').toLowerCase();
  const vendorName = (lead.vendor_name || '').toLowerCase();
  const leadType = (lead.lead_type || '').toLowerCase();

  if (leadType === 're_quote' || leadType === 're-quote') {
    return (
      callType.includes(VENDOR_FILTER_RULES.reQuoteSubstring) ||
      vendorName.includes(VENDOR_FILTER_RULES.reQuoteSubstring)
    );
  }

  if ((VENDOR_FILTER_RULES.inboundCallTypes as readonly string[]).includes(callType)) {
    return true;
  }

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

/** Per-lead-type breakdown of key metrics */
export interface LeadTypeBreakdown {
  leads: number;
  contacts: number;
  contactRate: number;
  quoted: number;
  quoteRate: number;
  contactToQuoteRate: number;
  callbacks: number;
  callbacksQuoted: number;
  callbackToQuoteRate: number;
  avgCallsToQuote: number;
  avgDaysToQuote: number;
  avgDaysContactToQuote: number;
  singleTouchQuotePct: number;
  sold: number;
  quotedToSoldRate: number;
  avgDaysToSoldFromSeen: number;
  avgDaysToSoldFromContact: number;
  avgDaysQuoteToSold: number;
  avgCallsQuoteToSold: number;
  noContactCount: number;
  noContactRate: number;
  stalePipelineCount: number;
  badPhoneCount: number;
  badPhoneRate: number;
  /** Leads where at least one voicemail was left */
  voicemailLeads: number;
  voicemailRate: number;
  /** Leads with voicemail left AND a callback received */
  voicemailCallbacks: number;
  /** Leads with NO voicemail that still called back */
  nonVoicemailCallbacks: number;
  voicemailCallbackToQuoteRate: number;
  nonVoicemailCallbackToQuoteRate: number;
  doNotCallCount: number;
  doNotCallRate: number;
}

export interface KPIData {
  totalLeads: number;
  newLeads: number;
  reQuoteLeads: number;
  totalContacts: number;
  totalQuotedHouseholds: number;
  totalSold: number;
  totalCallbacks: number;
  totalCallbacksQuoted: number;
  totalNoContact: number;
  totalStalePipeline: number;
  badPhoneCount: number;
  totalVoicemailLeads: number;
  totalVoicemailCallbacks: number;
  totalNonVoicemailCallbacks: number;
  voicemailLeadRate: number;
  voicemailCallbackToQuoteRate: number;
  nonVoicemailCallbackToQuoteRate: number;
  totalDoNotCall: number;
  doNotCallRate: number;
  contactRate: number;
  quoteRate: number;
  quotedToSoldRate: number;
  contactToQuoteRate: number;
  callbackToQuoteRate: number;
  noContactRate: number;
  avgCallsToQuote: number;
  avgDaysToQuote: number;
  avgDaysContactToQuote: number;
  singleTouchQuotePct: number;
  avgDaysToSoldFromSeen: number;
  avgDaysToSoldFromContact: number;
  avgDaysQuoteToSold: number;
  avgCallsQuoteToSold: number;
  badPhoneRate: number;
  badPhoneNewCount: number;
  badPhoneNewRate: number;
  badPhoneReQuoteCount: number;
  badPhoneReQuoteRate: number;
  /** Breakdown for new leads */
  newBreakdown: LeadTypeBreakdown;
  /** Breakdown for re-quote leads */
  reQuoteBreakdown: LeadTypeBreakdown;
}

// Helper: calculate breakdown metrics for a subset of leads
function calcBreakdown(leads: LeadRecord[]): LeadTypeBreakdown {
  const total = leads.length;
  const contactedLeads = leads.filter(l => isContacted(l));
  const contacts = contactedLeads.length;
  const quotedLeads = leads.filter(l => isQuoted(l.statuses));
  const quoted = quotedLeads.length;
  const callbackLeads = leads.filter(l => l.total_callbacks > 0);
  const callbacks = callbackLeads.length;
  const badPhone = leads.filter(l => l.has_bad_phone).length;

  const contactRate = calcRate(contacts, total);
  const quoteRate = calcRate(quoted, total);
  const contactedAndQuoted = contactedLeads.filter(l => isQuoted(l.statuses)).length;
  const contactToQuoteRate = calcRate(contactedAndQuoted, contacts);
  const callbacksQuoted = callbackLeads.filter(l => isQuoted(l.statuses)).length;
  const callbackToQuoteRate = calcRate(callbacksQuoted, callbackLeads.length);

  const quotedWithCalls = quotedLeads.filter(l => (l.calls_at_first_quote ?? l.total_call_attempts) > 0);
  const avgCallsToQuote = quotedWithCalls.length > 0
    ? quotedWithCalls.reduce((sum, l) => sum + (l.calls_at_first_quote ?? l.total_call_attempts), 0) / quotedWithCalls.length
    : 0;

  const quotedWithDates = quotedLeads.filter(l => l.first_seen_date && l.first_quote_date);
  const avgDaysToQuote = quotedWithDates.length > 0
    ? quotedWithDates.reduce((sum, l) => {
        const s = new Date(l.first_seen_date!).getTime();
        const e = new Date(l.first_quote_date!).getTime();
        return sum + Math.max(0, (e - s) / 86400000);
      }, 0) / quotedWithDates.length
    : 0;

  // Contact → Quote days
  const contactedAndQuotedWithDates = quotedLeads.filter(l => l.first_contact_date && l.first_quote_date);
  const avgDaysContactToQuote = contactedAndQuotedWithDates.length > 0
    ? contactedAndQuotedWithDates.reduce((sum, l) => {
        return sum + Math.max(0, (new Date(l.first_quote_date!).getTime() - new Date(l.first_contact_date!).getTime()) / 86400000);
      }, 0) / contactedAndQuotedWithDates.length
    : 0;

  // Single-touch quote % (only leads where calls_at_first_quote is known)
  const quotedWithCallSnapshot = quotedLeads.filter(l => l.calls_at_first_quote != null);
  const singleTouchQuotePct = calcRate(
    quotedWithCallSnapshot.filter(l => l.calls_at_first_quote === 1).length,
    quotedWithCallSnapshot.length,
  );

  // No-contact: leads that were called but never reached
  const calledLeads = leads.filter(l => l.total_call_attempts > 0);
  const noContactCount = calledLeads.filter(l => !isContacted(l)).length;
  const noContactRate = calcRate(noContactCount, calledLeads.length);

  // Stale pipeline: called but not updated in 7+ days, not sold, not bad phone
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const stalePipelineCount = leads.filter(l => {
    if (isSold(l.statuses) || l.has_bad_phone) return false;
    if (!l.latest_call_date || l.total_call_attempts === 0) return false;
    return l.latest_call_date < sevenDaysAgo;
  }).length;

  const soldLeads = leads.filter(l => isSold(l.statuses));
  const sold = soldLeads.length;
  const quotedToSoldRate = calcRate(sold, quoted);

  const soldSeen = soldLeads.filter(l => l.first_seen_date && l.first_sold_date);
  const avgDaysToSoldFromSeen = soldSeen.length > 0
    ? soldSeen.reduce((sum, l) => sum + Math.max(0, (new Date(l.first_sold_date!).getTime() - new Date(l.first_seen_date!).getTime()) / 86400000), 0) / soldSeen.length
    : 0;

  const soldContact = soldLeads.filter(l => l.first_contact_date && l.first_sold_date);
  const avgDaysToSoldFromContact = soldContact.length > 0
    ? soldContact.reduce((sum, l) => sum + Math.max(0, (new Date(l.first_sold_date!).getTime() - new Date(l.first_contact_date!).getTime()) / 86400000), 0) / soldContact.length
    : 0;

  const soldQuote = soldLeads.filter(l => l.first_quote_date && l.first_sold_date);
  const avgDaysQuoteToSold = soldQuote.length > 0
    ? soldQuote.reduce((sum, l) => sum + Math.max(0, (new Date(l.first_sold_date!).getTime() - new Date(l.first_quote_date!).getTime()) / 86400000), 0) / soldQuote.length
    : 0;

  const soldCalls = soldLeads.filter(l => l.calls_at_first_sold != null && l.calls_at_first_quote != null);
  const avgCallsQuoteToSold = soldCalls.length > 0
    ? soldCalls.reduce((sum, l) => sum + Math.max(0, l.calls_at_first_sold! - l.calls_at_first_quote!), 0) / soldCalls.length
    : 0;

  // Voicemail metrics
  const voicemailLeadsList = leads.filter(l => l.total_voicemails > 0);
  const voicemailLeads = voicemailLeadsList.length;
  const voicemailRate = calcRate(voicemailLeads, total);
  const voicemailCallbacks = voicemailLeadsList.filter(l => l.total_callbacks > 0).length;
  const nonVoicemailCallbacks = leads.filter(l => l.total_voicemails === 0 && l.total_callbacks > 0).length;
  const voicemailCallbackLeads = voicemailLeadsList.filter(l => l.total_callbacks > 0);
  const voicemailCallbackToQuoteRate = calcRate(
    voicemailCallbackLeads.filter(l => isQuoted(l.statuses)).length,
    voicemailCallbackLeads.length,
  );
  const nonVoicemailCallbackLeads = leads.filter(l => l.total_voicemails === 0 && l.total_callbacks > 0);
  const nonVoicemailCallbackToQuoteRate = calcRate(
    nonVoicemailCallbackLeads.filter(l => isQuoted(l.statuses)).length,
    nonVoicemailCallbackLeads.length,
  );

  // DNC
  const doNotCallCount = leads.filter(l => l.is_do_not_call).length;
  const doNotCallRate = calcRate(doNotCallCount, total);

  return {
    leads: total, contacts, contactRate, quoted, quoteRate,
    contactToQuoteRate, callbacks, callbacksQuoted, callbackToQuoteRate,
    avgCallsToQuote, avgDaysToQuote, avgDaysContactToQuote, singleTouchQuotePct,
    sold, quotedToSoldRate,
    avgDaysToSoldFromSeen, avgDaysToSoldFromContact,
    avgDaysQuoteToSold, avgCallsQuoteToSold,
    noContactCount, noContactRate, stalePipelineCount,
    badPhoneCount: badPhone,
    badPhoneRate: calcRate(badPhone, total),
    voicemailLeads, voicemailRate,
    voicemailCallbacks, nonVoicemailCallbacks,
    voicemailCallbackToQuoteRate, nonVoicemailCallbackToQuoteRate,
    doNotCallCount, doNotCallRate,
  };
}

export function calculateKPIs(leads: LeadRecord[], applyVendorFilter = false): KPIData {
  const filtered = applyVendorFilter ? leads.filter(passesVendorFilter) : leads;
  const totalLeads = filtered.length;
  const newLeadsList = filtered.filter(l => l.lead_type === 'new_lead');
  const reQuoteLeadsList = filtered.filter(l => l.lead_type === 're_quote');
  const newLeads = newLeadsList.length;
  const reQuoteLeads = reQuoteLeadsList.length;

  // Callbacks count as contacts
  const contactedLeads = filtered.filter(l => isContacted(l));
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
  const totalCallbacksQuoted = callbackLeads.filter(l => isQuoted(l.statuses)).length;
  const callbackToQuoteRate = calcRate(totalCallbacksQuoted, callbackLeads.length);

  const quotedWithCalls = quotedLeads.filter(l => (l.calls_at_first_quote ?? l.total_call_attempts) > 0);
  const avgCallsToQuote = quotedWithCalls.length > 0
    ? quotedWithCalls.reduce((sum, l) => sum + (l.calls_at_first_quote ?? l.total_call_attempts), 0) / quotedWithCalls.length
    : 0;

  const quotedWithDates = quotedLeads.filter(l => l.first_seen_date && l.first_quote_date);
  const avgDaysToQuote = quotedWithDates.length > 0
    ? quotedWithDates.reduce((sum, l) => {
        const start = new Date(l.first_seen_date!).getTime();
        const end = new Date(l.first_quote_date!).getTime();
        return sum + Math.max(0, (end - start) / 86400000);
      }, 0) / quotedWithDates.length
    : 0;

  const soldLeads = filtered.filter(l => isSold(l.statuses));
  const soldWithSeenDates = soldLeads.filter(l => l.first_seen_date && l.first_sold_date);
  const avgDaysToSoldFromSeen = soldWithSeenDates.length > 0
    ? soldWithSeenDates.reduce((sum, l) => {
        const start = new Date(l.first_seen_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / 86400000);
      }, 0) / soldWithSeenDates.length
    : 0;

  const soldWithContactDates = soldLeads.filter(l => l.first_contact_date && l.first_sold_date);
  const avgDaysToSoldFromContact = soldWithContactDates.length > 0
    ? soldWithContactDates.reduce((sum, l) => {
        const start = new Date(l.first_contact_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / 86400000);
      }, 0) / soldWithContactDates.length
    : 0;

  const soldWithQuoteDates = soldLeads.filter(l => l.first_quote_date && l.first_sold_date);
  const avgDaysQuoteToSold = soldWithQuoteDates.length > 0
    ? soldWithQuoteDates.reduce((sum, l) => {
        const start = new Date(l.first_quote_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / 86400000);
      }, 0) / soldWithQuoteDates.length
    : 0;

  const soldWithCallSnapshots = soldLeads.filter(
    l => l.calls_at_first_sold != null && l.calls_at_first_quote != null
  );
  const avgCallsQuoteToSold = soldWithCallSnapshots.length > 0
    ? soldWithCallSnapshots.reduce(
        (sum, l) => sum + Math.max(0, l.calls_at_first_sold! - l.calls_at_first_quote!), 0
      ) / soldWithCallSnapshots.length
    : 0;

  // New metrics
  const totalSold = soldLeads.length;
  const quotedToSoldRate = calcRate(totalSold, totalQuotedHouseholds);

  const calledLeads = filtered.filter(l => l.total_call_attempts > 0);
  const totalNoContact = calledLeads.filter(l => !isContacted(l)).length;
  const noContactRate = calcRate(totalNoContact, calledLeads.length);

  const contactedAndQuotedWithDates = quotedLeads.filter(l => l.first_contact_date && l.first_quote_date);
  const avgDaysContactToQuote = contactedAndQuotedWithDates.length > 0
    ? contactedAndQuotedWithDates.reduce((sum, l) => {
        return sum + Math.max(0, (new Date(l.first_quote_date!).getTime() - new Date(l.first_contact_date!).getTime()) / 86400000);
      }, 0) / contactedAndQuotedWithDates.length
    : 0;

  const quotedWithCallSnapshot = quotedLeads.filter(l => l.calls_at_first_quote != null);
  const singleTouchQuotePct = calcRate(
    quotedWithCallSnapshot.filter(l => l.calls_at_first_quote === 1).length,
    quotedWithCallSnapshot.length,
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const totalStalePipeline = filtered.filter(l => {
    if (isSold(l.statuses) || l.has_bad_phone) return false;
    if (!l.latest_call_date || l.total_call_attempts === 0) return false;
    return l.latest_call_date < sevenDaysAgo;
  }).length;

  // Voicemail totals
  const totalVoicemailLeads = filtered.filter(l => l.total_voicemails > 0).length;
  const voicemailLeadRate = calcRate(totalVoicemailLeads, totalLeads);
  const vmCallbackLeads = filtered.filter(l => l.total_voicemails > 0 && l.total_callbacks > 0);
  const totalVoicemailCallbacks = vmCallbackLeads.length;
  const totalNonVoicemailCallbacks = filtered.filter(l => l.total_voicemails === 0 && l.total_callbacks > 0).length;
  const voicemailCallbackToQuoteRate = calcRate(
    vmCallbackLeads.filter(l => isQuoted(l.statuses)).length,
    vmCallbackLeads.length,
  );
  const nonVmCallbackLeads = filtered.filter(l => l.total_voicemails === 0 && l.total_callbacks > 0);
  const nonVoicemailCallbackToQuoteRate = calcRate(
    nonVmCallbackLeads.filter(l => isQuoted(l.statuses)).length,
    nonVmCallbackLeads.length,
  );

  // DNC totals
  const totalDoNotCall = filtered.filter(l => l.is_do_not_call).length;
  const doNotCallRate = calcRate(totalDoNotCall, totalLeads);

  // Bad phone breakdowns
  const badPhoneNewCount = newLeadsList.filter(l => l.has_bad_phone).length;
  const badPhoneReQuoteCount = reQuoteLeadsList.filter(l => l.has_bad_phone).length;
  const badPhoneRate = calcRate(badPhoneCount, totalLeads);
  const badPhoneNewRate = calcRate(badPhoneNewCount, newLeadsList.length);
  const badPhoneReQuoteRate = calcRate(badPhoneReQuoteCount, reQuoteLeadsList.length);

  // Per-type breakdowns
  const newBreakdown = calcBreakdown(newLeadsList);
  const reQuoteBreakdown = calcBreakdown(reQuoteLeadsList);

  return {
    totalLeads, newLeads, reQuoteLeads,
    totalContacts, totalQuotedHouseholds, totalSold, totalCallbacks, totalCallbacksQuoted,
    totalNoContact, totalStalePipeline, badPhoneCount,
    contactRate, quoteRate, quotedToSoldRate, contactToQuoteRate, callbackToQuoteRate,
    noContactRate, avgCallsToQuote, avgDaysToQuote, avgDaysContactToQuote, singleTouchQuotePct,
    avgDaysToSoldFromSeen, avgDaysToSoldFromContact, avgDaysQuoteToSold, avgCallsQuoteToSold,
    badPhoneRate, badPhoneNewCount, badPhoneNewRate, badPhoneReQuoteCount, badPhoneReQuoteRate,
    totalVoicemailLeads, totalVoicemailCallbacks, totalNonVoicemailCallbacks,
    voicemailLeadRate, voicemailCallbackToQuoteRate, nonVoicemailCallbackToQuoteRate,
    totalDoNotCall, doNotCallRate,
    newBreakdown, reQuoteBreakdown,
  };
}
