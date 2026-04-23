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

// Report type identifiers
export const REPORT_TYPES = {
  DAILY_CALL: 'daily_call_report',
  DEER_DAMA: 'deer_dama_report',
  RICOCHET_LEAD_LIST: 'ricochet_lead_list',
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
