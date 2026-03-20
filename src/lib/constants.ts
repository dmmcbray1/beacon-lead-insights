// Disposition mappings - determines contact and quote status
export const CONTACT_DISPOSITIONS = [
  '2.1 CONTACTED - Not Interested',
  '2.2 CONTACTED - FOLLOW UP',
  '3.0 QUOTED',
  '3.1 QUOTED - HOT!!!!',
  '3.2 X DATE TASK SET',
  '4.0 SOLD',
] as const;

export const QUOTE_DISPOSITIONS = [
  '3.0 QUOTED',
  '3.1 QUOTED - HOT!!!!',
  '3.2 X DATE TASK SET',
  '4.0 SOLD',
] as const;

export const BAD_PHONE_STATUSES = [
  '1.1 CALLED BAD PHONE #',
] as const;

// Call type to direction mapping
export const DEFAULT_CALL_TYPE_MAPPINGS: Record<string, 'outbound' | 'inbound'> = {
  'Outbound Call': 'outbound',
  'Inbound Call': 'inbound',
  'Inbound IVR': 'inbound',
};

// Callback call types
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
