import { describe, it, expect } from 'vitest';
import { RICOCHET_COLUMNS, REPORT_TYPES } from './constants';

describe('RICOCHET_COLUMNS', () => {
  it('exposes the ricochet lead list report type', () => {
    expect(REPORT_TYPES.RICOCHET_LEAD_LIST).toBe('ricochet_lead_list');
  });

  it('includes the distinctive Ricochet columns', () => {
    expect(RICOCHET_COLUMNS).toEqual(
      expect.arrayContaining([
        'first name',
        'last name',
        'phone',
        'email',
        'campaign',
        'lead date',
        'dwelling value',
        'home value',
        'cost',
        'building sqft',
      ])
    );
  });

  it('entries are lowercased (matches detectReportType case-insensitive scoring)', () => {
    for (const c of RICOCHET_COLUMNS) {
      expect(c).toBe(c.toLowerCase());
    }
  });
});
