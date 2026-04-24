import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  parseLeadDate,
  parseNumeric,
  parseRicochetRow,
  dedupeRicochetRowsByPhone,
  isParseErr,
} from './ricochetParser';

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('205-206-3492')).toBe('2052063492');
    expect(normalizePhone('(205) 206.3492')).toBe('2052063492');
  });
  it('accepts 10-digit phones', () => {
    expect(normalizePhone('2052063492')).toBe('2052063492');
  });
  it('accepts 11-digit phones starting with 1', () => {
    expect(normalizePhone('12052063492')).toBe('12052063492');
  });
  it('returns null for too-short phones', () => {
    expect(normalizePhone('205206')).toBeNull();
  });
  it('returns null for blank/undefined', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('parseLeadDate', () => {
  it('parses M/D/YYYY', () => {
    expect(parseLeadDate('4/22/2026')).toBe('2026-04-22');
  });
  it('parses MM/DD/YYYY', () => {
    expect(parseLeadDate('04/22/2026')).toBe('2026-04-22');
  });
  it('parses YYYY-MM-DD', () => {
    expect(parseLeadDate('2026-04-22')).toBe('2026-04-22');
  });
  it('returns null on unparseable', () => {
    expect(parseLeadDate('not a date')).toBeNull();
    expect(parseLeadDate('')).toBeNull();
  });
});

describe('parseNumeric', () => {
  it('parses plain numbers', () => {
    expect(parseNumeric('217500')).toBe(217500);
    expect(parseNumeric('0.01')).toBe(0.01);
  });
  it('strips dollar signs and commas', () => {
    expect(parseNumeric('$217,500')).toBe(217500);
    expect(parseNumeric('$1,234.56')).toBe(1234.56);
  });
  it('returns null on blank/unparseable', () => {
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('n/a')).toBeNull();
  });
});

describe('parseRicochetRow', () => {
  const row = {
    'First Name': 'Ordrey',
    'Last Name': 'Sanders',
    'Street Address': '225 Kensington Ln',
    'City': 'Alabaster',
    'State': 'AL',
    'Zip': '35007',
    'Phone': '205-206-3492',
    'Email': 'asanders9840@gmail.com',
    'Campaign': '2009 Older Homes',
    'Lead Date': '4/22/2026',
    'Dwelling Value': '217500',
    'Home Value': '217500',
    'Cost': '0.01',
    'Bedrooms': '',
    'Total Bathrooms': '2.5',
    'Building Sqft': '2463',
    'Effective Year Built': '2002',
    'Number of Stories': '2',
  };

  it('returns a valid parsed row for well-formed input', () => {
    const parsed = parseRicochetRow(row, 1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.phoneNormalized).toBe('2052063492');
      expect(parsed.value.firstName).toBe('Ordrey');
      expect(parsed.value.leadDate).toBe('2026-04-22');
      expect(parsed.value.dwellingValue).toBe(217500);
      expect(parsed.value.campaign).toBe('2009 Older Homes');
      expect(parsed.value.payload).toMatchObject(row);
    }
  });

  it('returns an error for invalid phone', () => {
    const parsed = parseRicochetRow({ ...row, Phone: '' }, 1);
    expect(parsed.ok).toBe(false);
    if (isParseErr(parsed)) expect(parsed.error.reason).toBe('invalid_phone');
  });

  it('returns an error for invalid date', () => {
    const parsed = parseRicochetRow({ ...row, 'Lead Date': 'blah' }, 1);
    expect(parsed.ok).toBe(false);
    if (isParseErr(parsed)) expect(parsed.error.reason).toBe('invalid_date');
  });

  it('accepts blank numeric fields (stored as null)', () => {
    const parsed = parseRicochetRow({ ...row, 'Dwelling Value': '' }, 1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.dwellingValue).toBeNull();
  });
});

describe('dedupeRicochetRowsByPhone', () => {
  it('keeps the last occurrence when a phone appears multiple times', () => {
    const rows = [
      { rowNumber: 1, phoneNormalized: '2052063492', firstName: 'Old' },
      { rowNumber: 2, phoneNormalized: '9999999999', firstName: 'Other' },
      { rowNumber: 3, phoneNormalized: '2052063492', firstName: 'New' },
    ] as any;
    const { kept, dropped } = dedupeRicochetRowsByPhone(rows);
    expect(kept.map((r) => r.rowNumber)).toEqual([2, 3]);
    expect(dropped).toEqual([
      { rowNumber: 1, phoneNormalized: '2052063492', reason: 'duplicate_within_file' },
    ]);
  });
});
