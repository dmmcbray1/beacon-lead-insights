/**
 * Centralized metric calculation functions.
 * All KPI definitions live here for easy maintenance.
 */

import { CONTACT_DISPOSITIONS, QUOTE_DISPOSITIONS, SOLD_DISPOSITIONS, BAD_PHONE_STATUSES } from './constants';

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
  has_bad_phone: boolean;
  statuses: string[];
  vendor_name: string | null;
  call_direction: string | null;
}

export function isContact(statuses: string[]): boolean {
  return statuses.some(s =>
    CONTACT_DISPOSITIONS.some(d => d.toLowerCase() === s.trim().toLowerCase())
  );
}

export function isQuoted(statuses: string[]): boolean {
  return statuses.some(s =>
    QUOTE_DISPOSITIONS.some(d => d.toLowerCase() === s.trim().toLowerCase())
  );
}

export function isSold(statuses: string[]): boolean {
  return statuses.some(s =>
    SOLD_DISPOSITIONS.some(d => d.toLowerCase() === s.trim().toLowerCase())
  );
}

export function isBadPhone(statuses: string[]): boolean {
  return statuses.some(s =>
    BAD_PHONE_STATUSES.some(d => d.toLowerCase() === s.trim().toLowerCase())
  );
}

/**
 * Checks if a lead's vendor name passes the vendor filter rules.
 * - New leads outbound: vendor must contain "beacon territory"
 * - New leads inbound (including IVR): vendor must contain "beacon territory" or "inbound ivr"
 * - Re-quote leads: vendor must contain "requote"
 */
export function passesVendorFilter(lead: LeadRecord): boolean {
  const vendor = (lead.vendor_name || '').toLowerCase();
  const leadType = (lead.lead_type || '').toLowerCase();

  if (leadType === 're_quote' || leadType === 're-quote') {
    return vendor.includes('requote');
  }

  // New lead / other
  const direction = (lead.call_direction || '').toLowerCase();
  if (direction === 'inbound') {
    return vendor.includes('beacon territory') || vendor.includes('inbound ivr');
  }
  // Outbound or unspecified
  return vendor.includes('beacon territory');
}

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

  // Average calls to quote
  const quotedWithCalls = quotedLeads.filter(l => l.total_call_attempts > 0);
  const avgCallsToQuote = quotedWithCalls.length > 0
    ? quotedWithCalls.reduce((sum, l) => sum + l.total_call_attempts, 0) / quotedWithCalls.length
    : 0;

  // Average days to quote
  const quotedWithDates = quotedLeads.filter(l => l.first_seen_date && l.first_quote_date);
  const avgDaysToQuote = quotedWithDates.length > 0
    ? quotedWithDates.reduce((sum, l) => {
        const start = new Date(l.first_seen_date!).getTime();
        const end = new Date(l.first_quote_date!).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      }, 0) / quotedWithDates.length
    : 0;

  // Average days to sold (from first seen)
  const soldLeads = filtered.filter(l => isSold(l.statuses));
  const soldWithSeenDates = soldLeads.filter(l => l.first_seen_date && l.first_sold_date);
  const avgDaysToSoldFromSeen = soldWithSeenDates.length > 0
    ? soldWithSeenDates.reduce((sum, l) => {
        const start = new Date(l.first_seen_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      }, 0) / soldWithSeenDates.length
    : 0;

  // Average days to sold (from first contact)
  const soldWithContactDates = soldLeads.filter(l => l.first_contact_date && l.first_sold_date);
  const avgDaysToSoldFromContact = soldWithContactDates.length > 0
    ? soldWithContactDates.reduce((sum, l) => {
        const start = new Date(l.first_contact_date!).getTime();
        const end = new Date(l.first_sold_date!).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      }, 0) / soldWithContactDates.length
    : 0;

  return {
    totalLeads, newLeads, reQuoteLeads,
    totalContacts, totalQuotedHouseholds, totalCallbacks, badPhoneCount,
    contactRate, quoteRate, contactToQuoteRate, callbackToQuoteRate,
    avgCallsToQuote, avgDaysToQuote, avgDaysToSoldFromSeen, avgDaysToSoldFromContact,
  };
}
