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

// Re-quote indicator statuses (Current Status values)
export const REQUOTE_STATUSES = [
  '9.1 REQUOTE',
] as const;

/**
 * Vendor/territory filter rules.
 *
 * In the real Daily Call Report, "Beacon Territory" appears inside the
 * Call Type column (e.g. "9.5a: New Home to Beacon Territory : …"),
 * NOT in the Vendor Name column.
 *
 * Filter logic (applied to Call Type field, case-insensitive substring):
 *   - New lead outbound: Call Type contains "beacon territory"
 *   - New lead inbound:  Call Type equals "Inbound Call" or "Inbound IVR"
 *   - Re-quote:          Call Type OR Vendor Name contains "requote"
 */
export const VENDOR_FILTER_RULES = {
  /** Substring to find in Call Type for outbound new leads */
  newOutboundSubstring: 'beacon territory',
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

// Report type identifiers
export const REPORT_TYPES = {
  DAILY_CALL: 'daily_call_report',
  DEER_DAMA: 'deer_dama_report',
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
  'First Name', 'Last Name', 'Email', 'Phone - Main',
  'Address', '2nd Driver First Name', '2nd Driver\'s Last Name',
  'First Call Date', 'Last Call Date', 'Total Calls',
];

export const DEFAULT_AGENCY = 'McBrayer Agency';
