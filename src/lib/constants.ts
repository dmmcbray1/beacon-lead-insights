/**
 * Disposition mappings — determines contact, quote, sold, and bad-phone status.
 * Values are matched case-insensitively and trimmed.
 *
 * These lists are seeded from real Ricochet report data.
 */

// A lead counts as CONTACTED if any Daily Call Report Current Status matches:
export const CONTACT_DISPOSITIONS = [
  '2.0 CONTACTED - Follow Up',
  '2.1 CONTACTED - Not Interested',
  '2.2 CONTACTED - FOLLOW UP',
  '2.4 CONTACTED - Already Purchased',
  '2.6 CONTACTED - Hung Up',
  '3.0 QUOTED',
  '3.1 QUOTED - HOT!!!!',
  '3.2 QUOTED - Not Interested',
  '3.3 XDATE- Task Set',
  '4.0 SOLD',
] as const;

// A lead counts as a QUOTED HOUSEHOLD if any status matches:
export const QUOTE_DISPOSITIONS = [
  '3.0 QUOTED',
  '3.1 QUOTED - HOT!!!!',
  '3.2 QUOTED - Not Interested',
  '3.3 XDATE- Task Set',
  '4.0 SOLD',
] as const;

// A lead counts as SOLD if any status matches:
export const SOLD_DISPOSITIONS = [
  '4.0 SOLD',
] as const;

// A lead counts as BAD PHONE if any status matches:
export const BAD_PHONE_STATUSES = [
  '1.1 CALLED BAD PHONE #',
  '1.2 CALLED - Bad Phone #',
] as const;

// A call counts as a VOICEMAIL if the status matches:
export const VOICEMAIL_DISPOSITIONS = [
  '1.4 CALLED - Left Voicemail (List)',
] as const;

// Re-quote indicator statuses (Current Status values)
export const REQUOTE_STATUSES = [
  '9.1 REQUOTE',
] as const;

/**
 * Vendor/territory filter rules.
 *
 * "Beacon Territory" may appear in Call Type (e.g. "9.5a: New Home to Beacon Territory : …")
 * OR in Vendor Name (e.g. "New-Home-to-Beacon-Territory-List-Upload").
 * Follow-up call types like "Manual dial" / "3.x Assigned: …" are linked to Beacon Territory
 * solely via vendor name.
 * The "NEW-HOME-Priority-List" vendor is the Beacon Territory priority subset.
 *
 * Filter logic (case-insensitive):
 *   - New lead outbound: Call Type OR Vendor Name (hyphens → spaces) contains "beacon territory"
 *                        OR Vendor Name (hyphens → spaces) starts with "new home"
 *   - New lead inbound:  Call Type equals "Inbound Call" or "Inbound IVR"
 *   - Re-quote:          Call Type OR Vendor Name contains "requote"
 */
export const VENDOR_FILTER_RULES = {
  /** Substring to find in Call Type or normalised Vendor Name for outbound new leads */
  newOutboundSubstring: 'beacon territory',
  /** Vendor name prefix (hyphens → spaces) that also identifies Beacon Territory leads */
  beaconVendorPrefix: 'new home',
  /** Exact Call Type values for inbound new leads */
  inboundCallTypes: ['inbound call', 'inbound ivr'],
  /** Substring in Call Type or Vendor Name for re-quote leads */
  reQuoteSubstring: 'requote',
} as const;

/**
 * Call direction resolution.
 *
 * Real Call Type values are complex campaign strings, not simple labels.
 * Direction is determined by substring matching:
 *   - Contains "Inbound" at the start → inbound (lead phone = From)
 *   - Everything else → outbound (lead phone = To)
 *
 * The configurable mapping below covers known exact-match types.
 * For complex campaign strings, fallback to outbound.
 */
export const CALL_DIRECTION_RULES = {
  /** Call Type values (case-insensitive) that indicate inbound */
  inboundExact: ['Inbound Call', 'Inbound IVR'],
  /** If Call Type starts with any of these (case-insensitive), treat as outbound */
  outboundPatterns: ['beacon territory', 'manual dial'],
} as const;

// Legacy exact-match mapping (kept for admin UI / DB seeding)
export const DEFAULT_CALL_TYPE_MAPPINGS: Record<string, 'outbound' | 'inbound'> = {
  'Outbound Call': 'outbound',
  'Inbound Call': 'inbound',
  'Inbound IVR': 'inbound',
  'Manual dial': 'outbound',
};

// Callback call types (inbound types that create callback events)
export const CALLBACK_CALL_TYPES = ['Inbound Call', 'Inbound IVR'] as const;

// DO NOT CALL disposition
export const DO_NOT_CALL_STATUSES = [
  'XX - Do Not Call - XX',
] as const;

// Outbound call types used in campaign assignment
export const OUTBOUND_CALL_TYPES = [
  'Manual Dial',
  '3.0 Assigned: Contacted - Follow - Up',
  '3.1 Assigned: Quoted Follow up - Cam - Q',
  '3.2 Assigned: Quoted - HOT Follow UP - Cam - Q',
  '3.3 Assigned: Xdate - Task Set - Cam - Q',
  '5.0 Shark Tank: Sold/Customer - Cross Sale - Cam - Q',
  '7.1 Shark Tank: Requote (6 months) - Cam - Q',
  '9.1 Shark Tank: List Upload - 30-90 days old - Cam - Q',
  '9.5:  New Home to Beacon Territory: List Upload - Priority List Only Day 1 - Cam - Q',
  '9.5a:  New Home to Beacon Territory: List Upload - Priority List Only Day 2 - Cam - Q',
  '9.5b:  New Home to Beacon Territory: List Upload - Priority List Only Day 3 - Cam - Q',
  '9.5c:  New Home to Beacon Territory: List Upload - Priority List Only Day 4 - Cam - Q',
  '9.5d:  New Home to Beacon Territory: List Upload - Priority List Only Day 5 - Cam - Q',
  '9.5e:  New Home to Beacon Territory: List Upload - Priority List Only Day 6 - Cam - Q',
  '9.5f:  New Home to Beacon Territory: List Upload - Priority List Only Day 7 - Cam - Q',
  '9.5g:  New Home to Beacon Territory: List Upload - Priority List Only Day 8-13 - Cam - Q',
  '9.5h:  New Home to Beacon Territory: List Upload - Priority List Only Day 14-21 - Cam - Q',
  '9.5i:  New Home to Beacon Territory: List Upload - Priority List Only Day 22-30 - Cam - Q',
] as const;

// Contact timing day buckets — map from call type suffix to day label
export const CONTACT_TIMING_BUCKETS: Record<string, string> = {
  'day 1': 'Day 1',
  'day 2': 'Day 2',
  'day 3': 'Day 3',
  'day 4': 'Day 4',
  'day 5': 'Day 5',
  'day 6': 'Day 6',
  'day 7': 'Day 7',
  'day 8-13': 'Day 8-13',
  'day 14-21': 'Day 14-21',
  'day 22-30': 'Day 22-30',
};

// Report type identifiers
export const REPORT_TYPES = {
  DAILY_CALL: 'daily_call_report',
  DEER_DAMA: 'deer_dama_report',
  RICOCHET_LEAD_LIST: 'ricochet_lead_list',
  SALES_LOG: 'sales_log',
} as const;

// Expected columns for auto-detection
export const DAILY_CALL_COLUMNS = [
  'Date', 'Full name', 'User', 'From', 'To',
  'Call Duration', 'Call Duration In Seconds',
  'Current Status', 'Call Type', 'Call Status',
  'Vendor Name', 'Team',
];

export const DEER_DAMA_COLUMNS = [
  'Lead ID', 'Full Name', 'Lead Main State', 'Lead Status',
  'Lead Owner', 'Created At', 'Vendor', 'Last Status Date',
  'Email', 'Phone - Main',
  'First Call Date', 'Last Call Date', 'Total Calls',
];

export const RICOCHET_COLUMNS = [
  'first name',
  'last name',
  'street address',
  'city',
  'state',
  'zip',
  'phone',
  'email',
  'campaign',
  'lead date',
  'dwelling value',
  'home value',
  'cost',
  'bedrooms',
  'total bathrooms',
  'building sqft',
  'effective year built',
  'number of stories',
] as const;

export const DEFAULT_AGENCY = 'McBrayer Agency';

export const SALES_LOG_COLUMNS = [
  'Sale ID', 'Sale Date', 'Customer Name', 'Customer Email', 'Customer Phone',
  'Customer Zip', 'Lead Source', 'Lead Source Variant', 'Producer',
  'Policy Type', 'Policy Number', 'Effective Date', 'Items', 'Premium', 'Points', 'Line Items',
] as const;
