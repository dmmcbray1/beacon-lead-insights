/**
 * Sales Log CSV import engine.
 *
 * Processes a Sales Log CSV file:
 * - Filters to rows where Lead Source = 'Beacon Territory'
 * - Groups by Sale ID (household)
 * - Matches leads by normalized phone
 * - Creates new re_quote leads for unmatched households
 * - Inserts sales_events rows
 * - Updates lead sold fields
 */

import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhone } from './phone';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportProgress {
  phase: string;
  processed: number;
  total: number;
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  filtered: number;       // rows excluded (non-Beacon Territory)
  newLeadsCreated: number;
  errors: string[];
  uploadId: string;
}

interface SalesRow {
  saleId: string;
  saleDate: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  normalizedPhone: string | null;
  customerZip: string;
  leadSource: string;
  leadSourceVariant: string;
  producer: string;
  policyType: string;
  policyNumber: string;
  effectiveDate: string | null;
  items: number;
  premium: number;
  points: number;
  lineItems: string;
}

// ─── Helper: parse date value from XLSX ──────────────────────────────────────

function parseDateValue(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (!date) return null;
    const y = date.y;
    const m = String(date.m).padStart(2, '0');
    const d = String(date.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // Try M/D/YYYY or M/D/YY
    const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (mdyMatch) {
      const [, m, d, y] = mdyMatch;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Try ISO date
    const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    return null;
  }
  return null;
}

// ─── Parse CSV/XLSX into SalesRows ───────────────────────────────────────────

function parseSalesFile(rows: Record<string, unknown>[]): { beaconRows: SalesRow[]; filteredCount: number } {
  const beaconRows: SalesRow[] = [];
  let filteredCount = 0;

  for (const row of rows) {
    const leadSource = String(row['Lead Source'] ?? '').trim();
    if (leadSource.toLowerCase() !== 'beacon territory') {
      filteredCount++;
      continue;
    }

    const rawPhone = String(row['Customer Phone'] ?? '').trim();
    const normalizedPhoneValue = normalizePhone(rawPhone);

    beaconRows.push({
      saleId: String(row['Sale ID'] ?? '').trim(),
      saleDate: parseDateValue(row['Sale Date']),
      customerName: String(row['Customer Name'] ?? '').trim(),
      customerEmail: String(row['Customer Email'] ?? '').trim(),
      customerPhone: rawPhone,
      normalizedPhone: normalizedPhoneValue,
      customerZip: String(row['Customer Zip'] ?? '').trim(),
      leadSource,
      leadSourceVariant: String(row['Lead Source Variant'] ?? '').trim(),
      producer: String(row['Producer'] ?? '').trim(),
      policyType: String(row['Policy Type'] ?? '').trim(),
      policyNumber: String(row['Policy Number'] ?? '').trim(),
      effectiveDate: parseDateValue(row['Effective Date']),
      items: Number(row['Items'] ?? 1) || 1,
      premium: parseFloat(String(row['Premium'] ?? '0').replace(/[^0-9.]/g, '')) || 0,
      points: parseInt(String(row['Points'] ?? '0'), 10) || 0,
      lineItems: String(row['Line Items'] ?? '').trim(),
    });
  }

  return { beaconRows, filteredCount };
}

// ─── Main import function ─────────────────────────────────────────────────────

export async function importSalesLog(
  file: File,
  agencyId: string,
  uploadDate: string,
  uploadedBy: string | null,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const errors: string[] = [];

  // ── 1. Parse file ──────────────────────────────────────────────────────────
  onProgress?.({ phase: 'parsing', processed: 0, total: 0 });

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const totalRows = rawRows.length;
  const { beaconRows, filteredCount } = parseSalesFile(rawRows);

  if (beaconRows.length === 0) {
    // Still create upload record
    const { data: uploadData } = await supabase.from('uploads').insert({
      agency_id: agencyId,
      file_name: file.name,
      report_type: 'sales_log',
      upload_date: uploadDate,
      uploaded_by: uploadedBy,
      row_count: totalRows,
      matched_count: 0,
      status: 'complete',
    }).select('id').single();

    return {
      totalRows,
      imported: 0,
      filtered: filteredCount,
      newLeadsCreated: 0,
      errors: ['No Beacon Territory rows found in file.'],
      uploadId: uploadData?.id ?? '',
    };
  }

  // ── 2. Create upload record ────────────────────────────────────────────────
  onProgress?.({ phase: 'creating upload record', processed: 0, total: beaconRows.length });

  const { data: uploadData, error: uploadErr } = await supabase
    .from('uploads')
    .insert({
      agency_id: agencyId,
      file_name: file.name,
      report_type: 'sales_log',
      upload_date: uploadDate,
      uploaded_by: uploadedBy,
      row_count: totalRows,
      matched_count: 0,
      status: 'processing',
    })
    .select('id')
    .single();

  if (uploadErr || !uploadData) {
    throw new Error('Failed to create upload record: ' + (uploadErr?.message ?? 'unknown'));
  }
  const uploadId = uploadData.id;

  // ── 3. Load staff members for producer matching ───────────────────────────
  onProgress?.({ phase: 'loading staff', processed: 0, total: beaconRows.length });

  const { data: staffList } = await supabase
    .from('staff_members')
    .select('id, name')
    .eq('agency_id', agencyId);

  const staffMap = new Map<string, string>();
  for (const s of staffList ?? []) {
    staffMap.set(s.name.toLowerCase().trim(), s.id);
  }

  function matchProducer(producerName: string): string | null {
    if (!producerName) return null;
    const lower = producerName.toLowerCase().trim();
    // Exact match
    if (staffMap.has(lower)) return staffMap.get(lower)!;
    // Partial match
    for (const [staffName, staffId] of staffMap.entries()) {
      if (staffName.includes(lower) || lower.includes(staffName)) return staffId;
    }
    return null;
  }

  // ── 4. Group rows by Sale ID (household) ──────────────────────────────────
  const householdMap = new Map<string, SalesRow[]>();
  for (const row of beaconRows) {
    if (!householdMap.has(row.saleId)) householdMap.set(row.saleId, []);
    householdMap.get(row.saleId)!.push(row);
  }

  // ── 5. Collect unique phones for DB lookup ────────────────────────────────
  const uniquePhones = new Set<string>();
  for (const rows of householdMap.values()) {
    const phone = rows[0].normalizedPhone;
    if (phone) uniquePhones.add(phone);
  }

  // ── 6. Lookup existing leads by phone ─────────────────────────────────────
  onProgress?.({ phase: 'matching leads', processed: 0, total: householdMap.size });

  const leadsByPhone = new Map<string, string>(); // normalizedPhone -> leadId
  const phonesArray = [...uniquePhones];
  const CHUNK = 500;

  for (let i = 0; i < phonesArray.length; i += CHUNK) {
    const chunk = phonesArray.slice(i, i + CHUNK);
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, normalized_phone, total_call_attempts')
      .eq('agency_id', agencyId)
      .in('normalized_phone', chunk);

    if (leadsErr) {
      errors.push('Lead lookup error: ' + leadsErr.message);
      continue;
    }

    for (const lead of leads ?? []) {
      if (lead.normalized_phone) {
        leadsByPhone.set(lead.normalized_phone, lead.id);
      }
    }
  }

  // ── 7. Process each household ─────────────────────────────────────────────
  let imported = 0;
  let newLeadsCreated = 0;
  let processed = 0;

  for (const [saleId, policyRows] of householdMap.entries()) {
    processed++;
    onProgress?.({ phase: 'importing households', processed, total: householdMap.size });

    const firstRow = policyRows[0];
    const phone = firstRow.normalizedPhone;
    const saleDate = firstRow.saleDate;

    let leadId: string | null = phone ? (leadsByPhone.get(phone) ?? null) : null;

    // ── 7a. Create new lead if not found ─────────────────────────────────────
    if (!leadId) {
      try {
        // Split "First Last" name into parts
        const nameParts = (firstRow.customerName ?? '').trim().split(/\s+/);
        const firstName = nameParts[0] ?? null;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

        const { data: newLead, error: newLeadErr } = await supabase
          .from('leads')
          .insert({
            agency_id: agencyId,
            normalized_phone: phone ?? firstRow.customerPhone,
            current_lead_type: 're_quote',
            current_status: '4.0 SOLD',
            first_name: firstName,
            last_name: lastName,
            email: firstRow.customerEmail || null,
            zip: firstRow.customerZip || null,
            campaign: firstRow.leadSource || null,
            lead_date: saleDate,
            first_seen_date: saleDate ?? uploadDate,
            first_sold_date: saleDate,
            total_call_attempts: 0,
            total_callbacks: 0,
            total_voicemails: 0,
          })
          .select('id')
          .single();

        if (newLeadErr || !newLead) {
          errors.push(`Sale ${saleId}: Failed to create lead — ${newLeadErr?.message ?? 'unknown'}`);
          continue;
        }

        leadId = newLead.id;
        if (phone) leadsByPhone.set(phone, leadId);
        newLeadsCreated++;
      } catch (e) {
        errors.push(`Sale ${saleId}: Exception creating lead — ${String(e)}`);
        continue;
      }
    }

    // ── 7b. Compute aggregates for this household ─────────────────────────────
    const totalItems = policyRows.reduce((sum, r) => sum + r.items, 0);
    const totalPolicies = policyRows.length;
    const totalPremium = policyRows.reduce((sum, r) => sum + r.premium, 0);

    // ── 7c. Insert sales_events rows ─────────────────────────────────────────
    const eventsToInsert = policyRows.map((row) => ({
      agency_id: agencyId,
      lead_id: leadId,
      upload_id: uploadId,
      sale_id: saleId,
      sale_date: row.saleDate,
      customer_name: row.customerName || null,
      customer_phone: row.customerPhone || null,
      normalized_phone: row.normalizedPhone,
      customer_email: row.customerEmail || null,
      customer_zip: row.customerZip || null,
      lead_source: row.leadSource,
      producer: row.producer || null,
      staff_id: matchProducer(row.producer),
      policy_type: row.policyType || null,
      policy_number: row.policyNumber || null,
      effective_date: row.effectiveDate,
      items: row.items,
      premium: row.premium,
      points: row.points,
      line_items: row.lineItems || null,
    }));

    const { error: insertErr } = await supabase
      .from('sales_events')
      .insert(eventsToInsert);

    if (insertErr) {
      errors.push(`Sale ${saleId}: Failed to insert events — ${insertErr.message}`);
      continue;
    }

    imported += policyRows.length;

    // ── 7d. Update lead sold fields ───────────────────────────────────────────
    if (leadId) {
      try {
        // Fetch current lead data
        const { data: currentLead } = await supabase
          .from('leads')
          .select('first_sold_date, total_items_sold, total_policies_sold, total_premium, current_status, total_call_attempts')
          .eq('id', leadId)
          .single();

        const alreadySold = currentLead?.current_status === '6.0 CUSTOMER';
        const newStatus = alreadySold ? currentLead.current_status : '4.0 SOLD';
        const newFirstSoldDate = currentLead?.first_sold_date ?? saleDate;

        const updatePayload: Record<string, unknown> = {
          current_status: newStatus,
          first_sold_date: newFirstSoldDate,
          total_items_sold: (currentLead?.total_items_sold ?? 0) + totalItems,
          total_policies_sold: (currentLead?.total_policies_sold ?? 0) + totalPolicies,
          total_premium: (Number(currentLead?.total_premium ?? 0)) + totalPremium,
        };

        // Set calls_at_first_sold if this is the first sale
        if (!currentLead?.first_sold_date) {
          updatePayload.calls_at_first_sold = currentLead?.total_call_attempts ?? 0;
        }

        await supabase
          .from('leads')
          .update(updatePayload)
          .eq('id', leadId);
      } catch (e) {
        errors.push(`Sale ${saleId}: Failed to update lead — ${String(e)}`);
      }
    }
  }

  // ── 8. Finalize upload record ──────────────────────────────────────────────
  await supabase
    .from('uploads')
    .update({ matched_count: imported, status: 'complete' })
    .eq('id', uploadId);

  return {
    totalRows,
    imported,
    filtered: filteredCount,
    newLeadsCreated,
    errors,
    uploadId,
  };
}
