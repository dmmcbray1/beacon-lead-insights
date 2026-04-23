/**
 * Seed data for demo purposes.
 */
import type { KPIData, LeadTypeBreakdown } from './metrics';

export const SEED_AGENCIES = [
  { id: 'agency-1', name: 'McBrayer Agency' },
  { id: 'agency-2', name: 'Summit Insurance Group' },
];

export const SEED_STAFF = [
  { id: 'staff-1', name: 'Rachel Torres', agency_id: 'agency-1' },
  { id: 'staff-2', name: 'Marcus Chen', agency_id: 'agency-1' },
  { id: 'staff-3', name: 'Denise Walters', agency_id: 'agency-1' },
  { id: 'staff-4', name: 'James Okafor', agency_id: 'agency-2' },
  { id: 'staff-5', name: 'Linda Pham', agency_id: 'agency-2' },
];

const newBreakdown: LeadTypeBreakdown = {
  leads: 893,
  contacts: 439,
  contactRate: 0.492,
  quoted: 137,
  quoteRate: 0.154,
  contactToQuoteRate: 0.312,
  callbacks: 98,
  callbacksQuoted: 42,
  callbackToQuoteRate: 0.255,
  avgCallsToQuote: 4.8,
  avgDaysToQuote: 7.4,
  avgDaysContactToQuote: 3.1,
  singleTouchQuotePct: 0.18,
  sold: 23,
  quotedToSoldRate: 0.168,
  avgDaysToSoldFromSeen: 14.1,
  avgDaysToSoldFromContact: 10.2,
  avgDaysQuoteToSold: 5.8,
  avgCallsQuoteToSold: 3.1,
  noContactCount: 120,
  noContactRate: 0.35,
  stalePipelineCount: 45,
  badPhoneCount: 54,
  badPhoneRate: 0.0605,
  voicemailLeads: 180,
  voicemailRate: 0.202,
  voicemailCallbacks: 35,
  nonVoicemailCallbacks: 63,
  voicemailCallbackToQuoteRate: 0.28,
  nonVoicemailCallbackToQuoteRate: 0.24,
};

const reQuoteBreakdown: LeadTypeBreakdown = {
  leads: 354,
  contacts: 202,
  contactRate: 0.571,
  quoted: 81,
  quoteRate: 0.229,
  contactToQuoteRate: 0.401,
  callbacks: 89,
  callbacksQuoted: 38,
  callbackToQuoteRate: 0.326,
  avgCallsToQuote: 3.4,
  avgDaysToQuote: 5.1,
  avgDaysContactToQuote: 2.4,
  singleTouchQuotePct: 0.22,
  sold: 12,
  quotedToSoldRate: 0.148,
  avgDaysToSoldFromSeen: 9.2,
  avgDaysToSoldFromContact: 6.1,
  avgDaysQuoteToSold: 4.3,
  avgCallsQuoteToSold: 2.3,
  noContactCount: 35,
  noContactRate: 0.28,
  stalePipelineCount: 18,
  badPhoneCount: 19,
  badPhoneRate: 0.0537,
  voicemailLeads: 72,
  voicemailRate: 0.203,
  voicemailCallbacks: 18,
  nonVoicemailCallbacks: 71,
  voicemailCallbackToQuoteRate: 0.32,
  nonVoicemailCallbackToQuoteRate: 0.31,
};

export function getSeedKPIs(): KPIData {
  return {
    totalLeads: 1247,
    newLeads: 893,
    reQuoteLeads: 354,
    totalContacts: 641,
    totalQuotedHouseholds: 218,
    totalCallbacks: 187,
    badPhoneCount: 73,
    contactRate: 0.514,
    quoteRate: 0.175,
    contactToQuoteRate: 0.340,
    callbackToQuoteRate: 0.289,
    avgCallsToQuote: 4.3,
    avgDaysToQuote: 6.8,
    avgDaysToSoldFromSeen: 12.4,
    avgDaysToSoldFromContact: 8.7,
    avgDaysQuoteToSold: 5.2,
    avgCallsQuoteToSold: 2.8,
    badPhoneRate: 0.0585,
    badPhoneNewCount: 54,
    badPhoneNewRate: 0.0605,
    badPhoneReQuoteCount: 19,
    badPhoneReQuoteRate: 0.0537,
    newBreakdown,
    reQuoteBreakdown,
  };
}

export interface SeedLead {
  id: string;
  phone: string;
  lead_id: string | null;
  agency: string;
  lead_type: string;
  status: string;
  staff: string;
  first_seen: string;
  first_contact: string | null;
  first_quote: string | null;
  calls: number;
  callbacks: number;
  vendor: string;
}

export function getSeedLeads(): SeedLead[] {
  return [
    { id: '1', phone: '(555) 234-8901', lead_id: 'LD-10234', agency: 'McBrayer Agency', lead_type: 'New', status: '3.0 QUOTED', staff: 'Rachel Torres', first_seen: '2025-03-01', first_contact: '2025-03-02', first_quote: '2025-03-05', calls: 5, callbacks: 1, vendor: 'QuoteWizard' },
    { id: '2', phone: '(555) 345-6789', lead_id: 'LD-10235', agency: 'McBrayer Agency', lead_type: 'New', status: '2.2 CONTACTED - FOLLOW UP', staff: 'Marcus Chen', first_seen: '2025-03-02', first_contact: '2025-03-03', first_quote: null, calls: 3, callbacks: 0, vendor: 'EverQuote' },
    { id: '3', phone: '(555) 456-7890', lead_id: 'LD-10236', agency: 'McBrayer Agency', lead_type: 'Re-Quote', status: '4.0 SOLD', staff: 'Denise Walters', first_seen: '2025-02-15', first_contact: '2025-02-16', first_quote: '2025-02-18', calls: 4, callbacks: 2, vendor: 'QuoteWizard' },
    { id: '4', phone: '(555) 567-1234', lead_id: null, agency: 'McBrayer Agency', lead_type: 'New', status: '1.1 CALLED BAD PHONE #', staff: 'Rachel Torres', first_seen: '2025-03-10', first_contact: null, first_quote: null, calls: 2, callbacks: 0, vendor: 'MediaAlpha' },
    { id: '5', phone: '(555) 678-2345', lead_id: 'LD-10238', agency: 'McBrayer Agency', lead_type: 'New', status: '2.1 CONTACTED - Not Interested', staff: 'Marcus Chen', first_seen: '2025-03-08', first_contact: '2025-03-09', first_quote: null, calls: 3, callbacks: 1, vendor: 'EverQuote' },
    { id: '6', phone: '(555) 789-3456', lead_id: 'LD-10239', agency: 'Summit Insurance Group', lead_type: 'New', status: '3.1 QUOTED - HOT!!!!', staff: 'James Okafor', first_seen: '2025-03-05', first_contact: '2025-03-06', first_quote: '2025-03-08', calls: 6, callbacks: 1, vendor: 'QuoteWizard' },
    { id: '7', phone: '(555) 890-4567', lead_id: 'LD-10240', agency: 'Summit Insurance Group', lead_type: 'Re-Quote', status: '3.2 X DATE TASK SET', staff: 'Linda Pham', first_seen: '2025-02-20', first_contact: '2025-02-21', first_quote: '2025-02-25', calls: 7, callbacks: 3, vendor: 'MediaAlpha' },
    { id: '8', phone: '(555) 901-5678', lead_id: 'LD-10241', agency: 'McBrayer Agency', lead_type: 'New', status: '1.0 NOT CONTACTED', staff: 'Denise Walters', first_seen: '2025-03-12', first_contact: null, first_quote: null, calls: 1, callbacks: 0, vendor: 'QuoteWizard' },
  ];
}

export interface StaffPerformance {
  name: string;
  agency: string;
  calls: number;
  contacts: number;
  callbacks: number;
  quoted: number;
  contactRate: number;
  quoteRate: number;
  contactToQuoteRate: number;
  callbackToQuoteRate: number;
  avgCallsToQuote: number;
  avgDaysToQuote: number;
  badPhoneRate: number;
}

export function getSeedStaffPerformance(): StaffPerformance[] {
  return [
    { name: 'Rachel Torres', agency: 'McBrayer Agency', calls: 312, contacts: 148, callbacks: 42, quoted: 53, contactRate: 0.526, quoteRate: 0.188, contactToQuoteRate: 0.358, callbackToQuoteRate: 0.310, avgCallsToQuote: 4.1, avgDaysToQuote: 5.9, badPhoneRate: 0.058 },
    { name: 'Marcus Chen', agency: 'McBrayer Agency', calls: 287, contacts: 134, callbacks: 38, quoted: 44, contactRate: 0.498, quoteRate: 0.163, contactToQuoteRate: 0.328, callbackToQuoteRate: 0.263, avgCallsToQuote: 4.6, avgDaysToQuote: 7.2, badPhoneRate: 0.063 },
    { name: 'Denise Walters', agency: 'McBrayer Agency', calls: 298, contacts: 155, callbacks: 51, quoted: 58, contactRate: 0.542, quoteRate: 0.203, contactToQuoteRate: 0.374, callbackToQuoteRate: 0.333, avgCallsToQuote: 3.8, avgDaysToQuote: 5.4, badPhoneRate: 0.047 },
    { name: 'James Okafor', agency: 'Summit Insurance Group', calls: 264, contacts: 121, callbacks: 33, quoted: 38, contactRate: 0.492, quoteRate: 0.154, contactToQuoteRate: 0.314, callbackToQuoteRate: 0.273, avgCallsToQuote: 5.1, avgDaysToQuote: 8.1, badPhoneRate: 0.072 },
    { name: 'Linda Pham', agency: 'Summit Insurance Group', calls: 276, contacts: 138, callbacks: 44, quoted: 47, contactRate: 0.517, quoteRate: 0.176, contactToQuoteRate: 0.341, callbackToQuoteRate: 0.295, avgCallsToQuote: 4.4, avgDaysToQuote: 6.5, badPhoneRate: 0.051 },
  ];
}

export function getSeedTrendData() {
  return [
    { date: 'Mar 1', leads: 48, contacts: 24, quotes: 8, callbacks: 7 },
    { date: 'Mar 2', leads: 52, contacts: 27, quotes: 9, callbacks: 8 },
    { date: 'Mar 3', leads: 41, contacts: 22, quotes: 7, callbacks: 6 },
    { date: 'Mar 4', leads: 55, contacts: 29, quotes: 11, callbacks: 9 },
    { date: 'Mar 5', leads: 47, contacts: 25, quotes: 8, callbacks: 7 },
    { date: 'Mar 6', leads: 63, contacts: 33, quotes: 12, callbacks: 10 },
    { date: 'Mar 7', leads: 38, contacts: 19, quotes: 6, callbacks: 5 },
    { date: 'Mar 8', leads: 51, contacts: 26, quotes: 9, callbacks: 8 },
    { date: 'Mar 9', leads: 44, contacts: 23, quotes: 8, callbacks: 7 },
    { date: 'Mar 10', leads: 57, contacts: 30, quotes: 10, callbacks: 9 },
    { date: 'Mar 11', leads: 49, contacts: 25, quotes: 9, callbacks: 7 },
    { date: 'Mar 12', leads: 61, contacts: 32, quotes: 11, callbacks: 10 },
    { date: 'Mar 13', leads: 43, contacts: 22, quotes: 7, callbacks: 6 },
    { date: 'Mar 14', leads: 53, contacts: 28, quotes: 10, callbacks: 8 },
  ];
}
