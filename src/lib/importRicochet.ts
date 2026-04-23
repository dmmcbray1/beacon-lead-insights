import { supabase } from '@/integrations/supabase/client';
import type { RicochetRow, RicochetRowParseError } from './ricochetParser';
import { parseRicochetRow, dedupeRicochetRowsByPhone } from './ricochetParser';
import * as XLSX from 'xlsx';

export interface RicochetMatch {
  incoming: RicochetRow;
  existing: {
    id: string;
    phoneNormalized: string;
    firstName: string | null;
    lastName: string | null;
    campaign: string | null;
    createdAt: string;
    streetAddress: string | null;
    city: string | null;
    state: string | null;
  };
}

export interface ParsedRicochetFile {
  rows: RicochetRow[];
  errors: RicochetRowParseError[];
}

export interface RicochetWriteSummary {
  rowsImported: number;   // new leads created
  rowsUpdated: number;    // existing leads overwritten
  requotesLogged: number; // total requote events
  errors: RicochetRowParseError[];
}

export type RicochetDecision = 'requote' | 'overwrite';

/**
 * Parse a Ricochet .csv/.xlsx file into typed rows + errors.
 * Pure (no DB access) — safe to call in the browser during "preview" step.
 */
export async function parseRicochetFile(file: File): Promise<ParsedRicochetFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const parsedRows: RicochetRow[] = [];
  const errors: RicochetRowParseError[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // header row = 1
    const result = parseRicochetRow(row, rowNumber);
    if (result.ok) parsedRows.push(result.value);
    else errors.push(result.error);
  });

  const { kept, dropped } = dedupeRicochetRowsByPhone(parsedRows);
  errors.push(...dropped.map((d) => ({ rowNumber: d.rowNumber, reason: d.reason })));

  return { rows: kept, errors };
}

/**
 * Lookup existing leads in this agency whose phone matches any incoming row.
 * Chunked at 500 to stay under PostgREST URL limits.
 *
 * IMPORTANT: the `leads` table column is `normalized_phone` (not
 * `phone_normalized`). Match Supabase select/filter strings to the real
 * column name.
 */
export async function detectRicochetMatches(
  rows: RicochetRow[],
  agencyId: string
): Promise<RicochetMatch[]> {
  if (rows.length === 0) return [];

  const phones = rows.map((r) => r.phoneNormalized);
  const chunkSize = 500;
  const existingByPhone = new Map<string, RicochetMatch['existing']>();

  for (let i = 0; i < phones.length; i += chunkSize) {
    const chunk = phones.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('leads')
      .select('id, normalized_phone, first_name, last_name, campaign, created_at, street_address, city, state')
      .eq('agency_id', agencyId)
      .in('normalized_phone', chunk);

    if (error) throw error;

    for (const lead of data ?? []) {
      existingByPhone.set(lead.normalized_phone as string, {
        id: lead.id as string,
        phoneNormalized: lead.normalized_phone as string,
        firstName: (lead.first_name as string | null) ?? null,
        lastName: (lead.last_name as string | null) ?? null,
        campaign: (lead.campaign as string | null) ?? null,
        createdAt: lead.created_at as string,
        streetAddress: (lead.street_address as string | null) ?? null,
        city: (lead.city as string | null) ?? null,
        state: (lead.state as string | null) ?? null,
      });
    }
  }

  return rows
    .filter((r) => existingByPhone.has(r.phoneNormalized))
    .map((r) => ({ incoming: r, existing: existingByPhone.get(r.phoneNormalized)! }));
}

/**
 * Merge: Ricochet overwrites existing fields where it has a non-blank value;
 * blanks preserve existing data. Returns a partial lead row suitable for UPDATE.
 */
export function mergeLeadOverwrite(
  existing: {
    first_name: string | null; last_name: string | null; email: string | null;
    street_address: string | null; city: string | null; state: string | null;
    zip: string | null; campaign: string | null; lead_date: string | null;
    dwelling_value: number | null; home_value: number | null; lead_cost: number | null;
  },
  incoming: RicochetRow
): Record<string, unknown> {
  void existing; // currently unused; could enable per-field diff/skip if needed
  const merged: Record<string, unknown> = {};
  if (incoming.firstName     != null) merged.first_name     = incoming.firstName;
  if (incoming.lastName      != null) merged.last_name      = incoming.lastName;
  if (incoming.email         != null) merged.email          = incoming.email;
  if (incoming.streetAddress != null) merged.street_address = incoming.streetAddress;
  if (incoming.city          != null) merged.city           = incoming.city;
  if (incoming.state         != null) merged.state          = incoming.state;
  if (incoming.zip           != null) merged.zip            = incoming.zip;
  if (incoming.campaign      != null) merged.campaign       = incoming.campaign;
  if (incoming.leadDate      != null) merged.lead_date      = incoming.leadDate;
  if (incoming.dwellingValue != null) merged.dwelling_value = incoming.dwellingValue;
  if (incoming.homeValue     != null) merged.home_value     = incoming.homeValue;
  if (incoming.leadCost      != null) merged.lead_cost      = incoming.leadCost;
  return merged;
}

/**
 * Phase 0 write. Assumes the `uploads` row has already been created by
 * `importBatch` (so failures in this function can be rolled back via
 * `deleteBatch`).
 */
export async function writeRicochetPhase(params: {
  uploadId: string;
  batchId: string;
  agencyId: string;
  rows: RicochetRow[];
  existingMatches: Map<string, RicochetMatch['existing']>; // keyed by normalized_phone
  decisions: Map<string, RicochetDecision>;                // keyed by normalized_phone; missing = 'requote' default
  parseErrors: RicochetRowParseError[];
}): Promise<RicochetWriteSummary> {
  const { uploadId, batchId, agencyId, rows, existingMatches, decisions, parseErrors } = params;

  // 1. Bulk insert raw_ricochet_rows.
  const rawInserts = rows.map((r) => ({
    upload_id: uploadId,
    batch_id: batchId,
    agency_id: agencyId,
    row_number: r.rowNumber,
    phone_raw: r.phoneRaw,
    normalized_phone: r.phoneNormalized,
    first_name: r.firstName,
    last_name: r.lastName,
    email: r.email,
    street_address: r.streetAddress,
    city: r.city,
    state: r.state,
    zip: r.zip,
    campaign: r.campaign,
    lead_date: r.leadDate,
    dwelling_value: r.dwellingValue,
    home_value: r.homeValue,
    lead_cost: r.leadCost,
    payload: r.payload,
  }));

  const { data: rawRowsInserted, error: rawErr } = await supabase
    .from('raw_ricochet_rows')
    .insert(rawInserts)
    .select('id, normalized_phone');
  if (rawErr) throw rawErr;

  const rawIdByPhone = new Map<string, string>();
  for (const rr of rawRowsInserted ?? []) {
    rawIdByPhone.set(rr.normalized_phone as string, rr.id as string);
  }

  // 2. Route each row by decision.
  let rowsImported = 0;
  let rowsUpdated = 0;
  let requotesLogged = 0;

  for (const r of rows) {
    const match = existingMatches.get(r.phoneNormalized);
    const decision = decisions.get(r.phoneNormalized) ?? 'requote';

    if (!match) {
      // No match → INSERT new lead.
      const { error: insErr } = await supabase.from('leads').insert({
        agency_id: agencyId,
        normalized_phone: r.phoneNormalized,
        first_name: r.firstName,
        last_name: r.lastName,
        email: r.email,
        street_address: r.streetAddress,
        city: r.city,
        state: r.state,
        zip: r.zip,
        campaign: r.campaign,
        lead_date: r.leadDate,
        dwelling_value: r.dwellingValue,
        home_value: r.homeValue,
        lead_cost: r.leadCost,
        ricochet_source_upload_id: uploadId,
      });
      if (insErr) throw insErr;
      rowsImported++;
      continue;
    }

    // Match — log requote event regardless of decision.
    if (decision === 'overwrite') {
      // Fetch existing to apply blank-preserving merge.
      const { data: existingLead, error: fetchErr } = await supabase
        .from('leads')
        .select('first_name, last_name, email, street_address, city, state, zip, campaign, lead_date, dwelling_value, home_value, lead_cost')
        .eq('id', match.id)
        .single();
      if (fetchErr) throw fetchErr;

      const merged = mergeLeadOverwrite(existingLead as any, r);
      if (Object.keys(merged).length > 0) {
        const { error: updErr } = await supabase
          .from('leads')
          .update(merged)
          .eq('id', match.id);
        if (updErr) throw updErr;
      }
      rowsUpdated++;
    }

    const { error: reqErr } = await supabase.from('lead_requote_events').insert({
      lead_id: match.id,
      upload_id: uploadId,
      batch_id: batchId,
      agency_id: agencyId,
      raw_row_id: rawIdByPhone.get(r.phoneNormalized) ?? null,
      campaign: r.campaign,
      lead_cost: r.leadCost,
      lead_date: r.leadDate,
      was_overwritten: decision === 'overwrite',
    });
    if (reqErr) throw reqErr;
    requotesLogged++;
  }

  return { rowsImported, rowsUpdated, requotesLogged, errors: parseErrors };
}
