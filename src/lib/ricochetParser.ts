import { parse as parseDate, isValid as isValidDate, format as formatDate } from 'date-fns';

export interface RicochetRow {
  rowNumber: number;
  phoneRaw: string;
  phoneNormalized: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  campaign: string | null;
  leadDate: string;            // ISO YYYY-MM-DD
  dwellingValue: number | null;
  homeValue: number | null;
  leadCost: number | null;
  payload: Record<string, unknown>;
}

export type RicochetRowParseError = {
  rowNumber: number;
  reason:
    | 'invalid_phone'
    | 'invalid_date'
    | 'duplicate_within_file'
    | 'missing_required_column';
  detail?: string;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RicochetRowParseError };

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return digits;
  return null;
}

export function parseLeadDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const formats = ['M/d/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'M-d-yyyy'];
  for (const fmt of formats) {
    const d = parseDate(s, fmt, new Date());
    if (isValidDate(d)) return formatDate(d, 'yyyy-MM-dd');
  }
  return null;
}

export function parseNumeric(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

function pick(row: Record<string, unknown>, key: string): unknown {
  // Case-insensitive column access to match BatchDropSlot's detection behavior.
  const lowered = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lowered) return row[k];
  }
  return undefined;
}

export function parseRicochetRow(
  row: Record<string, unknown>,
  rowNumber: number
): ParseResult<RicochetRow> {
  const phoneRaw = String(pick(row, 'Phone') ?? '');
  const phoneNormalized = normalizePhone(phoneRaw);
  if (!phoneNormalized) {
    return { ok: false, error: { rowNumber, reason: 'invalid_phone' } };
  }

  const leadDate = parseLeadDate(String(pick(row, 'Lead Date') ?? ''));
  if (!leadDate) {
    return { ok: false, error: { rowNumber, reason: 'invalid_date' } };
  }

  return {
    ok: true,
    value: {
      rowNumber,
      phoneRaw,
      phoneNormalized,
      firstName: trimOrNull(pick(row, 'First Name')),
      lastName: trimOrNull(pick(row, 'Last Name')),
      email: trimOrNull(pick(row, 'Email')),
      streetAddress: trimOrNull(pick(row, 'Street Address')),
      city: trimOrNull(pick(row, 'City')),
      state: trimOrNull(pick(row, 'State')),
      zip: trimOrNull(pick(row, 'Zip')),
      campaign: trimOrNull(pick(row, 'Campaign')),
      leadDate,
      dwellingValue: parseNumeric(String(pick(row, 'Dwelling Value') ?? '')),
      homeValue: parseNumeric(String(pick(row, 'Home Value') ?? '')),
      leadCost: parseNumeric(String(pick(row, 'Cost') ?? '')),
      payload: row,
    },
  };
}

export function dedupeRicochetRowsByPhone(rows: RicochetRow[]): {
  kept: RicochetRow[];
  dropped: Array<{ rowNumber: number; phoneNormalized: string; reason: 'duplicate_within_file' }>;
} {
  // Last occurrence wins. Walk backward, track seen phones, keep first seen
  // (which is the last in original order).
  const seen = new Set<string>();
  const keptReverse: RicochetRow[] = [];
  const dropped: Array<{ rowNumber: number; phoneNormalized: string; reason: 'duplicate_within_file' }> = [];

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (seen.has(r.phoneNormalized)) {
      dropped.push({ rowNumber: r.rowNumber, phoneNormalized: r.phoneNormalized, reason: 'duplicate_within_file' });
    } else {
      seen.add(r.phoneNormalized);
      keptReverse.push(r);
    }
  }
  const kept = keptReverse.reverse();
  dropped.reverse();
  return { kept, dropped };
}
