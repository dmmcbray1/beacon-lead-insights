/**
 * CSV import pipeline for Daily Call Report and Deer Dama (Lead) Report.
 *
 * Daily Call Report  — one row per call, parsed to call_events + leads
 * Deer Dama Report   — one row per lead, parsed to leads
 *
 * Both reports are vendor-filtered to "Beacon Territory" leads only.
 */

import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhone } from './phone';
import {
  CONTACT_DISPOSITIONS,
  QUOTE_DISPOSITIONS,
  SOLD_DISPOSITIONS,
  BAD_PHONE_STATUSES,
  REQUOTE_STATUSES,
  VOICEMAIL_DISPOSITIONS,
  REPORT_TYPES,
  VENDOR_FILTER_RULES,
} from './constants';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ImportProgress {
  phase: string;
  processed: number;
  total: number;
}

export interface ImportResult {
  uploadId: string;
  rowsTotal: number;
  rowsImported: number;
  rowsFiltered: number;
  rowsSkipped: number;
  newLeads: number;
  updatedLeads: number;
  errors: string[];
  /**
   * Set when the file matches a previously-imported file (same SHA-256 hash
   * within the same agency) and the caller did not pass `force: true`.
   * When present, no rows were imported — the caller should prompt the user
   * to confirm and re-invoke the importer with `force: true`.
   */
  duplicateOf?: {
    uploadId: string;
    fileName: string;
    uploadDate: string;
  };
}

export interface BatchProgress {
  currentFile: 'daily_call' | 'deer_dama';
  fileIndex: 1 | 2;
  phase: string;
  processed: number;
  total: number;
}

export interface BatchResult {
  batchId: string;
  dailyCall: ImportResult;
  deerDama: ImportResult;
  rolledBack: boolean;
  rollbackError?: string;
  /**
   * Populated when either file is a duplicate of a previously-imported file
   * and `force` was false. When set, no rows were imported for either file —
   * the caller should prompt the user and re-invoke importBatch with force: true.
   */
  duplicateOf?: {
    dailyCall?: { uploadId: string; fileName: string; uploadDate: string };
    deerDama?: { uploadId: string; fileName: string; uploadDate: string };
  };
}

export class BatchRollbackError extends Error {
  constructor(
    public readonly failedFile: 'daily_call' | 'deer_dama',
    public readonly originalError: Error,
    public readonly rollbackError?: Error,
  ) {
    super(
      `Batch failed on ${failedFile}: ${originalError.message}` +
        (rollbackError ? ` (rollback also failed: ${rollbackError.message})` : ''),
    );
    this.name = 'BatchRollbackError';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Compute the SHA-256 hex digest of a file's raw bytes. */
async function computeFileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Look up an existing upload with the same hash in the same agency.
 * Returns `null` when there is no prior match.
 */
async function findDuplicateUpload(
  fileHash: string,
  agencyId: string,
): Promise<{ uploadId: string; fileName: string; uploadDate: string } | null> {
  const { data } = await supabase
    .from('uploads')
    .select('id, file_name, upload_date')
    .eq('agency_id', agencyId)
    .eq('file_hash', fileHash)
    .order('created_at', { ascending: false })
    .limit(1);
  const match = data?.[0];
  if (!match) return null;
  return {
    uploadId: match.id,
    fileName: match.file_name,
    uploadDate: match.upload_date,
  };
}

function buildDuplicateResult(
  rowsTotal: number,
  duplicateOf: { uploadId: string; fileName: string; uploadDate: string },
): ImportResult {
  return {
    uploadId: '',
    rowsTotal,
    rowsImported: 0,
    rowsFiltered: 0,
    rowsSkipped: 0,
    newLeads: 0,
    updatedLeads: 0,
    errors: [],
    duplicateOf,
  };
}

/** Parse a File (CSV or XLSX) into an array of plain objects. */
export function parseFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellText: true, cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** Return true if the status string matches any item in a list (case-insensitive). */
function matchesStatus(value: string, list: readonly string[]): boolean {
  const v = value.trim().toLowerCase();
  return list.some((s) => s.toLowerCase() === v);
}

/** Determine whether a Daily Call row passes the Beacon Territory vendor filter. */
function rowPassesVendorFilter(callType: string, vendorName: string, _currentStatus: string): boolean {
  const ct = callType.trim().toLowerCase();
  const vn = vendorName.trim().toLowerCase();
  // Normalise hyphens → spaces so "New-Home-to-Beacon-Territory-List-Upload" matches "beacon territory"
  const vnNorm = vn.replace(/-/g, ' ');

  // Inbound calls always pass (callbacks)
  if ((VENDOR_FILTER_RULES.inboundCallTypes as readonly string[]).some((t) => t.toLowerCase() === ct)) {
    return true;
  }

  // Re-quote: call type OR vendor name contains "requote" (regardless of current status,
  // since follow-up calls on requote leads may carry a downstream status like "3.3 XDATE")
  if (ct.includes(VENDOR_FILTER_RULES.reQuoteSubstring) || vn.includes(VENDOR_FILTER_RULES.reQuoteSubstring)) {
    return true;
  }

  // Beacon Territory outbound: check call type OR normalised vendor name for "beacon territory",
  // OR vendor name starts with "new home" (covers the "NEW-HOME-Priority-List" priority subset)
  const beaconSub = VENDOR_FILTER_RULES.newOutboundSubstring;
  if (ct.includes(beaconSub) || vnNorm.includes(beaconSub)) return true;
  if (vnNorm.startsWith(VENDOR_FILTER_RULES.beaconVendorPrefix)) return true;

  return false;
}

/** Parse a date-like value from a CSV cell into an ISO date string (YYYY-MM-DD) or null. */
function parseDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const yr = d.getUTCFullYear();
  if (yr < 1900 || yr > 2100) return null;
  return d.toISOString().split('T')[0];
}

function str(val: unknown): string {
  return String(val ?? '').trim();
}

function int(val: unknown): number {
  return parseInt(String(val ?? '0'), 10) || 0;
}

function getLeadType(status: string): 'new_lead' | 're_quote' {
  return matchesStatus(status, REQUOTE_STATUSES) ? 're_quote' : 'new_lead';
}

/**
 * The string stored in `latest_vendor_name` on the lead is used later to
 * reconstruct the call_type hint for the vendor filter (passesVendorFilter).
 * Convention:
 *   "beacon territory" → new outbound Beacon Territory lead
 *   "inbound call"     → inbound lead (always passes filter)
 *   "requote"          → re-quote lead
 *
 * Must also check vendorName when callType is a generic label like "Manual dial"
 * or "3.x Assigned: …" — the vendor name is the only beacon territory signal there.
 */
function vendorHint(callType: string, vendorName: string, isInbound: boolean, leadType: 'new_lead' | 're_quote'): string {
  if (leadType === 're_quote') return 'requote';
  if (isInbound) return 'inbound call';
  if (callType.toLowerCase().includes('beacon territory')) return 'beacon territory';
  const vnNorm = vendorName.toLowerCase().replace(/-/g, ' ');
  if (vnNorm.includes(VENDOR_FILTER_RULES.newOutboundSubstring) || vnNorm.startsWith(VENDOR_FILTER_RULES.beaconVendorPrefix)) {
    return 'beacon territory';
  }
  return callType || 'beacon territory';
}

// ─── Staff cache (per import run, cleared at start) ───────────────────────────

const staffCache = new Map<string, string>(); // "name|agencyId" → staffMemberId

async function getOrCreateStaff(name: string, agencyId: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const cacheKey = `${trimmed}|${agencyId}`;
  if (staffCache.has(cacheKey)) return staffCache.get(cacheKey)!;

  const { data: existing } = await supabase
    .from('staff_members')
    .select('id')
    .eq('name', trimmed)
    .eq('agency_id', agencyId)
    .limit(1);

  if (existing && existing.length > 0) {
    staffCache.set(cacheKey, existing[0].id);
    return existing[0].id;
  }

  const { data: created, error } = await supabase
    .from('staff_members')
    .insert({ name: trimmed, agency_id: agencyId })
    .select('id')
    .single();

  if (error || !created) return null;
  staffCache.set(cacheKey, created.id);
  return created.id;
}

// ─── Lead lookup by phone (within agency) ─────────────────────────────────────

async function bulkLookupLeadsByPhone(
  phones: string[],
  agencyId: string,
): Promise<Map<string, { id: string; total_call_attempts: number; total_callbacks: number; total_voicemails: number; has_bad_phone: boolean; first_seen_date: string | null; first_contact_date: string | null; first_callback_date: string | null; first_quote_date: string | null; first_sold_date: string | null; first_daily_call_date: string | null; latest_call_date: string | null }>> {
  if (phones.length === 0) return new Map();

  const { data } = await supabase
    .from('leads')
    .select(
      'id, normalized_phone, total_call_attempts, total_callbacks, total_voicemails, has_bad_phone, first_seen_date, first_contact_date, first_callback_date, first_quote_date, first_sold_date, first_daily_call_date, latest_call_date',
    )
    .in('normalized_phone', phones)
    .eq('agency_id', agencyId);

  const map = new Map<string, (typeof data)[0]>();
  for (const row of data ?? []) {
    map.set(row.normalized_phone, row as (typeof data)[0]);
  }
  return map as ReturnType<typeof bulkLookupLeadsByPhone> extends Promise<infer T> ? T : never;
}

async function lookupLeadByExternalId(externalId: string, agencyId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('lead_id_external', externalId)
    .eq('agency_id', agencyId)
    .limit(1);
  return data?.[0]?.id ?? null;
}

// ─── Daily Call Report ────────────────────────────────────────────────────────

export async function importDailyCallReport(
  file: File,
  agencyId: string,
  uploadDate: string,
  notes: string,
  onProgress?: (p: ImportProgress) => void,
  force = false,
  batchId: string | null = null,
): Promise<ImportResult> {
  staffCache.clear();
  const errors: string[] = [];

  onProgress?.({ phase: 'Parsing file…', processed: 0, total: 0 });

  let rows: Record<string, unknown>[];
  try {
    rows = await parseFile(file);
  } catch (e) {
    return {
      uploadId: '',
      rowsTotal: 0,
      rowsImported: 0,
      rowsFiltered: 0,
      rowsSkipped: 0,
      newLeads: 0,
      updatedLeads: 0,
      errors: ['Failed to parse file: ' + String(e)],
    };
  }

  // Duplicate-import detection
  const fileHash = await computeFileHash(file);
  if (!force) {
    const dup = await findDuplicateUpload(fileHash, agencyId);
    if (dup) return buildDuplicateResult(rows.length, dup);
  }

  // Create upload record
  const { data: upload, error: uploadErr } = await supabase
    .from('uploads')
    .insert({
      agency_id: agencyId,
      file_name: file.name,
      report_type: REPORT_TYPES.DAILY_CALL,
      upload_date: uploadDate,
      notes,
      status: 'processing',
      row_count: rows.length,
      // Store hash only on the first (non-forced) import so override re-imports
      // remain permitted under the partial unique index.
      file_hash: force ? null : fileHash,
      batch_id: batchId,
    })
    .select('id')
    .single();

  if (uploadErr || !upload) {
    return {
      uploadId: '',
      rowsTotal: rows.length,
      rowsImported: 0,
      rowsFiltered: 0,
      rowsSkipped: 0,
      newLeads: 0,
      updatedLeads: 0,
      errors: ['Failed to create upload record: ' + (uploadErr?.message ?? 'unknown error')],
    };
  }

  const uploadId = upload.id;

  // ── Phase 1: Filter rows and collect unique phones ────────────────────────

  onProgress?.({ phase: 'Filtering rows…', processed: 0, total: rows.length });

  type ProcessedRow = {
    raw: Record<string, unknown>;
    rowNum: number;
    phone: string;
    callType: string;
    currentStatus: string;
    callStatus: string;
    vendorName: string;
    userName: string;
    fromNum: string;
    toNum: string;
    callDurSec: number;
    dateVal: string;
    callDateStr: string | null;
    isInbound: boolean;
    isContact: boolean;
    isBadPhone: boolean;
    isQuote: boolean;
    isSold: boolean;
    isCallback: boolean;
    isVoicemail: boolean;
    leadType: 'new_lead' | 're_quote';
    hint: string;
  };

  const validRows: ProcessedRow[] = [];
  let rowsFiltered = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const callType = str(row['Call Type']);
    const currentStatus = str(row['Current Status']);
    const vendorName = str(row['Vendor Name']);

    if (!rowPassesVendorFilter(callType, vendorName, currentStatus)) {
      rowsFiltered++;
      continue;
    }

    const fromNum = str(row['From']);
    const toNum = str(row['To']);
    const isInbound = callType.toLowerCase().startsWith('inbound');
    const rawPhone = isInbound ? fromNum : toNum;
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      rowsFiltered++;
      continue;
    }

    const leadType = getLeadType(currentStatus);
    const statusLower = currentStatus.toLowerCase().trim();
    const isContact = CONTACT_DISPOSITIONS.some((d) => d.toLowerCase() === statusLower);
    const isBadPhone = BAD_PHONE_STATUSES.some((d) => d.toLowerCase() === statusLower);
    const isQuote = QUOTE_DISPOSITIONS.some((d) => d.toLowerCase() === statusLower);
    const isSold = SOLD_DISPOSITIONS.some((d) => d.toLowerCase() === statusLower);
    const isCallback = isInbound;
    const isVoicemail = VOICEMAIL_DISPOSITIONS.some((d) => d.toLowerCase() === statusLower);
    const callDateStr = parseDate(row['Date']);

    validRows.push({
      raw: row,
      rowNum: i + 1,
      phone,
      callType,
      currentStatus,
      callStatus: str(row['Call Status']),
      vendorName,
      userName: str(row['User']),
      fromNum,
      toNum,
      callDurSec: int(row['Call Duration In Seconds']),
      dateVal: str(row['Date']),
      callDateStr,
      isInbound,
      isContact,
      isBadPhone,
      isQuote,
      isSold,
      isCallback,
      isVoicemail,
      leadType,
      hint: vendorHint(callType, vendorName, isInbound, leadType),
    });
  }

  // ── Phase 2: Bulk look up existing leads ──────────────────────────────────

  onProgress?.({ phase: 'Looking up existing leads…', processed: 0, total: validRows.length });

  const uniquePhones = [...new Set(validRows.map((r) => r.phone))];
  const existingMap = await bulkLookupLeadsByPhone(uniquePhones, agencyId);

  // Per-lead accumulated state for leads we're updating this run
  type LeadState = {
    id: string;
    total_call_attempts: number;
    total_callbacks: number;
    total_voicemails: number;
    has_bad_phone: boolean;
    first_seen_date: string | null;
    first_contact_date: string | null;
    first_callback_date: string | null;
    first_quote_date: string | null;
    first_sold_date: string | null;
    first_daily_call_date: string | null;
    latest_call_date: string | null;
    current_status: string;
    current_lead_type: string;
    latest_vendor_name: string;
    isNew: boolean;
  };

  const leadStates = new Map<string, LeadState>();

  function takeEarlier(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  function takeLater(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
  }

  for (const vr of validRows) {
    const existing = existingMap.get(vr.phone);

    if (!leadStates.has(vr.phone)) {
      if (existing) {
        leadStates.set(vr.phone, {
          id: existing.id,
          total_call_attempts: existing.total_call_attempts ?? 0,
          total_callbacks: existing.total_callbacks ?? 0,
          total_voicemails: existing.total_voicemails ?? 0,
          has_bad_phone: existing.has_bad_phone ?? false,
          first_seen_date: existing.first_seen_date,
          first_contact_date: existing.first_contact_date,
          first_callback_date: existing.first_callback_date,
          first_quote_date: existing.first_quote_date,
          first_sold_date: existing.first_sold_date,
          first_daily_call_date: existing.first_daily_call_date,
          latest_call_date: existing.latest_call_date,
          current_status: vr.currentStatus,
          current_lead_type: vr.leadType,
          latest_vendor_name: vr.hint,
          isNew: false,
        });
      } else {
        leadStates.set(vr.phone, {
          id: '', // filled after insert
          total_call_attempts: 0,
          total_callbacks: 0,
          total_voicemails: 0,
          has_bad_phone: false,
          first_seen_date: vr.callDateStr,
          first_contact_date: null,
          first_callback_date: null,
          first_quote_date: null,
          first_sold_date: null,
          first_daily_call_date: vr.callDateStr,
          latest_call_date: vr.callDateStr,
          current_status: vr.currentStatus,
          current_lead_type: vr.leadType,
          latest_vendor_name: vr.hint,
          isNew: true,
        });
      }
    }

    const state = leadStates.get(vr.phone)!;

    // Accumulate
    state.total_call_attempts += 1;
    if (vr.isCallback) state.total_callbacks += 1;
    if (vr.isVoicemail) state.total_voicemails += 1;
    if (vr.isBadPhone) state.has_bad_phone = true;
    state.current_status = vr.currentStatus;
    state.current_lead_type = vr.leadType;
    state.latest_vendor_name = vr.hint;

    if (vr.callDateStr) {
      state.first_seen_date = takeEarlier(state.first_seen_date, vr.callDateStr);
      state.first_daily_call_date = takeEarlier(state.first_daily_call_date, vr.callDateStr);
      state.latest_call_date = takeLater(state.latest_call_date, vr.callDateStr);
      if (vr.isContact) state.first_contact_date = takeEarlier(state.first_contact_date, vr.callDateStr);
      if (vr.isCallback) state.first_callback_date = takeEarlier(state.first_callback_date, vr.callDateStr);
      if (vr.isQuote) state.first_quote_date = takeEarlier(state.first_quote_date, vr.callDateStr);
      if (vr.isSold) state.first_sold_date = takeEarlier(state.first_sold_date, vr.callDateStr);
    }
  }

  // ── Phase 3: Insert new leads ─────────────────────────────────────────────

  onProgress?.({ phase: 'Creating new leads…', processed: 0, total: validRows.length });

  let newLeads = 0;
  const newPhones = [...leadStates.entries()].filter(([, s]) => s.isNew).map(([p]) => p);

  if (newPhones.length > 0) {
    // Insert in batches of 100
    const BATCH = 100;
    for (let i = 0; i < newPhones.length; i += BATCH) {
      const batch = newPhones.slice(i, i + BATCH);
      const inserts = batch.map((phone) => {
        const s = leadStates.get(phone)!;
        return {
          agency_id: agencyId,
          normalized_phone: phone,
          raw_phone: phone,
          current_lead_type: s.current_lead_type,
          current_status: s.current_status,
          first_seen_date: s.first_seen_date,
          first_daily_call_date: s.first_daily_call_date,
          latest_call_date: s.latest_call_date,
          latest_vendor_name: s.latest_vendor_name,
          total_call_attempts: s.total_call_attempts,
          total_callbacks: s.total_callbacks,
          total_voicemails: s.total_voicemails,
          has_bad_phone: s.has_bad_phone,
          first_contact_date: s.first_contact_date,
          first_callback_date: s.first_callback_date,
          first_quote_date: s.first_quote_date,
          first_sold_date: s.first_sold_date,
        };
      });

      const { data: created, error: createErr } = await supabase
        .from('leads')
        .insert(inserts)
        .select('id, normalized_phone');

      if (createErr) {
        errors.push(`Batch insert error: ${createErr.message}`);
        continue;
      }

      for (const row of created ?? []) {
        const state = leadStates.get(row.normalized_phone);
        if (state) {
          state.id = row.id;
          newLeads++;
        }
      }
    }
  }

  // ── Phase 4: Update existing leads ────────────────────────────────────────

  let updatedLeads = 0;
  const toUpdate = [...leadStates.entries()].filter(([, s]) => !s.isNew && s.id);

  for (const [, state] of toUpdate) {
    const { error } = await supabase
      .from('leads')
      .update({
        current_status: state.current_status,
        current_lead_type: state.current_lead_type,
        latest_vendor_name: state.latest_vendor_name,
        latest_call_date: state.latest_call_date,
        total_call_attempts: state.total_call_attempts,
        total_callbacks: state.total_callbacks,
        total_voicemails: state.total_voicemails,
        has_bad_phone: state.has_bad_phone,
        first_daily_call_date: state.first_daily_call_date,
        first_contact_date: state.first_contact_date,
        first_callback_date: state.first_callback_date,
        first_quote_date: state.first_quote_date,
        first_sold_date: state.first_sold_date,
      })
      .eq('id', state.id);

    if (!error) updatedLeads++;
    else errors.push(`Failed to update lead ${state.id}: ${error.message}`);
  }

  // ── Phase 5: Insert call_events ───────────────────────────────────────────

  onProgress?.({ phase: 'Saving call events…', processed: 0, total: validRows.length });

  let rowsImported = 0;
  let rowsSkipped = 0;

  // Pre-fetch staff IDs for all unique user names
  const uniqueUsers = [...new Set(validRows.map((r) => r.userName).filter(Boolean))];
  const staffIds = new Map<string, string | null>();
  for (const user of uniqueUsers) {
    staffIds.set(user, await getOrCreateStaff(user, agencyId));
  }

  // Build call_events array
  const callEventBatch: Record<string, unknown>[] = [];
  const rawRowBatch: Record<string, unknown>[] = [];

  for (const vr of validRows) {
    const state = leadStates.get(vr.phone);
    if (!state?.id) {
      rowsSkipped++;
      continue;
    }

    callEventBatch.push({
      agency_id: agencyId,
      lead_id: state.id,
      call_date: vr.callDateStr,
      call_type: vr.callType,
      call_direction: vr.isInbound ? 'inbound' : 'outbound',
      call_duration_seconds: vr.callDurSec,
      call_status: vr.callStatus,
      current_status: vr.currentStatus,
      is_contact: vr.isContact,
      is_callback: vr.isCallback,
      is_quote: vr.isQuote,
      is_bad_phone: vr.isBadPhone,
      is_voicemail: vr.isVoicemail,
      staff_id: staffIds.get(vr.userName) ?? null,
      vendor_name: vr.vendorName,
      source_upload_id: uploadId,
    });

    rawRowBatch.push({
      upload_id: uploadId,
      row_number: vr.rowNum,
      date: vr.callDateStr,
      full_name: str(vr.raw['Full name']),
      user_name: vr.userName,
      from_number: vr.fromNum,
      to_number: vr.toNum,
      call_type: vr.callType,
      current_status: vr.currentStatus,
      call_status: vr.callStatus,
      vendor_name: vr.vendorName,
      call_duration: str(vr.raw['Call Duration']),
      call_duration_seconds: vr.callDurSec,
      normalized_phone: vr.phone,
      raw_phone: vr.isInbound ? vr.fromNum : vr.toNum,
      resolved_lead_phone: vr.phone,
      matched_lead_id: state.id,
      match_rule: existingMap.has(vr.phone) ? 'phone' : 'new',
      processing_status: 'matched',
      raw_data: vr.raw,
    });

    rowsImported++;
  }

  // Insert in batches of 500
  const CALL_BATCH = 500;
  for (let i = 0; i < callEventBatch.length; i += CALL_BATCH) {
    const { error } = await supabase
      .from('call_events')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(callEventBatch.slice(i, i + CALL_BATCH) as any);
    if (error) errors.push(`call_events batch error: ${error.message}`);

    onProgress?.({ phase: 'Saving call events…', processed: Math.min(i + CALL_BATCH, callEventBatch.length), total: callEventBatch.length });
  }

  for (let i = 0; i < rawRowBatch.length; i += CALL_BATCH) {
    const { error } = await supabase
      .from('raw_daily_call_rows')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(rawRowBatch.slice(i, i + CALL_BATCH) as any);
    if (error) errors.push(`raw_daily_call_rows batch error: ${error.message}`);
  }

  // Finalise upload record
  await supabase
    .from('uploads')
    .update({
      status: errors.length > 0 ? 'complete_with_errors' : 'complete',
      matched_count: rowsImported,
      unmatched_count: rowsSkipped + rowsFiltered,
      error_count: errors.length,
    })
    .eq('id', uploadId);

  return {
    uploadId,
    rowsTotal: rows.length,
    rowsImported,
    rowsFiltered,
    rowsSkipped,
    newLeads,
    updatedLeads,
    errors: errors.slice(0, 20),
  };
}

// ─── Deer Dama (Lead) Report ─────────────────────────────────────────────────

export async function importDeerDamaReport(
  file: File,
  agencyId: string,
  uploadDate: string,
  notes: string,
  onProgress?: (p: ImportProgress) => void,
  force = false,
  batchId: string | null = null,
): Promise<ImportResult> {
  staffCache.clear();
  const errors: string[] = [];

  onProgress?.({ phase: 'Parsing file…', processed: 0, total: 0 });

  let rows: Record<string, unknown>[];
  try {
    rows = await parseFile(file);
  } catch (e) {
    return {
      uploadId: '',
      rowsTotal: 0,
      rowsImported: 0,
      rowsFiltered: 0,
      rowsSkipped: 0,
      newLeads: 0,
      updatedLeads: 0,
      errors: ['Failed to parse file: ' + String(e)],
    };
  }

  // Duplicate-import detection
  const fileHash = await computeFileHash(file);
  if (!force) {
    const dup = await findDuplicateUpload(fileHash, agencyId);
    if (dup) return buildDuplicateResult(rows.length, dup);
  }

  const { data: upload, error: uploadErr } = await supabase
    .from('uploads')
    .insert({
      agency_id: agencyId,
      file_name: file.name,
      report_type: REPORT_TYPES.DEER_DAMA,
      upload_date: uploadDate,
      notes,
      status: 'processing',
      row_count: rows.length,
      file_hash: force ? null : fileHash,
      batch_id: batchId,
    })
    .select('id')
    .single();

  if (uploadErr || !upload) {
    return {
      uploadId: '',
      rowsTotal: rows.length,
      rowsImported: 0,
      rowsFiltered: 0,
      rowsSkipped: 0,
      newLeads: 0,
      updatedLeads: 0,
      errors: ['Failed to create upload record'],
    };
  }

  const uploadId = upload.id;
  let rowsImported = 0;
  let rowsSkipped = 0;
  let newLeads = 0;
  let updatedLeads = 0;

  // ── Phase 1: Parse & validate all rows ──────────────────────────────────
  onProgress?.({ phase: 'Validating rows…', processed: 0, total: rows.length });

  type ProcessedRow = {
    raw: Record<string, unknown>;
    rowNum: number;
    phone: string;
    phoneRaw: string;
    externalId: string;
    fullName: string;
    leadStatus: string;
    leadOwner: string;
    createdAtStr: string | null;
    vendor: string;
    firstCallStr: string | null;
    lastCallStr: string | null;
    totalCalls: number;
    isContact: boolean;
    isBadPhone: boolean;
    isQuote: boolean;
    isSold: boolean;
    leadType: 'new_lead' | 're_quote';
  };

  const validRows: ProcessedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phoneRaw = str(row['Phone - Main']);
    const normalizedPh = normalizePhone(phoneRaw);
    if (!normalizedPh) {
      rowsSkipped++;
      continue;
    }

    const leadStatus = str(row['Lead Status']);
    const statusLower = leadStatus.toLowerCase().trim();

    validRows.push({
      raw: row,
      rowNum: i + 1,
      phone: normalizedPh,
      phoneRaw,
      externalId: str(row['Lead ID']),
      fullName: str(row['Full Name']),
      leadStatus,
      leadOwner: str(row['Lead Owner']),
      createdAtStr: parseDate(row['Created At']),
      vendor: str(row['Vendor']),
      firstCallStr: parseDate(row['First Call Date']),
      lastCallStr: parseDate(row['Last Call Date']),
      totalCalls: int(row['Total Calls']),
      isContact: CONTACT_DISPOSITIONS.some((d) => d.toLowerCase() === statusLower),
      isBadPhone: BAD_PHONE_STATUSES.some((d) => d.toLowerCase() === statusLower),
      isQuote: QUOTE_DISPOSITIONS.some((d) => d.toLowerCase() === statusLower),
      isSold: SOLD_DISPOSITIONS.some((d) => d.toLowerCase() === statusLower),
      leadType: getLeadType(leadStatus),
    });
  }

  // ── Phase 2: Batch-lookup existing leads (by phone + by external id) ───
  onProgress?.({ phase: 'Looking up existing leads…', processed: 0, total: validRows.length });

  type ExistingLead = {
    id: string;
    first_contact_date: string | null;
    first_quote_date: string | null;
    first_sold_date: string | null;
  };

  const uniquePhones = [...new Set(validRows.map((r) => r.phone))];
  const uniqueExternalIds = [...new Set(validRows.map((r) => r.externalId).filter(Boolean))];

  const phoneMap = new Map<string, ExistingLead>();
  const externalIdMap = new Map<string, ExistingLead>();

  const LOOKUP_BATCH = 500;
  for (let i = 0; i < uniquePhones.length; i += LOOKUP_BATCH) {
    const chunk = uniquePhones.slice(i, i + LOOKUP_BATCH);
    const { data } = await supabase
      .from('leads')
      .select('id, normalized_phone, first_contact_date, first_quote_date, first_sold_date')
      .eq('agency_id', agencyId)
      .in('normalized_phone', chunk);
    for (const row of data ?? []) {
      phoneMap.set(row.normalized_phone, {
        id: row.id,
        first_contact_date: row.first_contact_date,
        first_quote_date: row.first_quote_date,
        first_sold_date: row.first_sold_date,
      });
    }
  }
  for (let i = 0; i < uniqueExternalIds.length; i += LOOKUP_BATCH) {
    const chunk = uniqueExternalIds.slice(i, i + LOOKUP_BATCH);
    const { data } = await supabase
      .from('leads')
      .select('id, lead_id_external, first_contact_date, first_quote_date, first_sold_date')
      .eq('agency_id', agencyId)
      .in('lead_id_external', chunk);
    for (const row of data ?? []) {
      if (!row.lead_id_external) continue;
      externalIdMap.set(row.lead_id_external, {
        id: row.id,
        first_contact_date: row.first_contact_date,
        first_quote_date: row.first_quote_date,
        first_sold_date: row.first_sold_date,
      });
    }
  }

  // Per-phone state for leads we'll insert or update. Keyed by phone so a
  // repeated phone in the same file merges into a single new-lead insert
  // instead of violating the phone-unique constraint.
  type LeadState = {
    id: string;
    isNew: boolean;
    existing: ExistingLead | null;
    // Fields we'll write to the lead (new or update)
    externalId: string;
    phone: string;
    phoneRaw: string;
    leadType: 'new_lead' | 're_quote';
    leadStatus: string;
    createdAtStr: string | null;
    lastCallStr: string | null;
    vendor: string;
    totalCalls: number;
    hasBadPhone: boolean;
    firstContactDate: string | null;
    firstQuoteDate: string | null;
    firstSoldDate: string | null;
    callsAtFirstQuote: number | null;
    callsAtFirstSold: number | null;
    matchRule: 'new' | 'lead_id' | 'phone';
  };

  const leadStates = new Map<string, LeadState>();

  for (const vr of validRows) {
    const viaExternal = vr.externalId ? externalIdMap.get(vr.externalId) ?? null : null;
    const viaPhone = phoneMap.get(vr.phone) ?? null;
    const existing = viaExternal ?? viaPhone;

    let state = leadStates.get(vr.phone);
    if (!state) {
      state = {
        id: existing?.id ?? '',
        isNew: !existing,
        existing,
        externalId: vr.externalId,
        phone: vr.phone,
        phoneRaw: vr.phoneRaw,
        leadType: vr.leadType,
        leadStatus: vr.leadStatus,
        createdAtStr: vr.createdAtStr,
        lastCallStr: vr.lastCallStr,
        vendor: vr.vendor,
        totalCalls: vr.totalCalls,
        hasBadPhone: vr.isBadPhone,
        firstContactDate: existing?.first_contact_date ?? null,
        firstQuoteDate: existing?.first_quote_date ?? null,
        firstSoldDate: existing?.first_sold_date ?? null,
        callsAtFirstQuote: null,
        callsAtFirstSold: null,
        matchRule: existing ? (viaExternal ? 'lead_id' : 'phone') : 'new',
      };
      leadStates.set(vr.phone, state);
    } else {
      // Merge a repeated row for the same phone — take latest status / calls.
      state.leadStatus = vr.leadStatus;
      state.leadType = vr.leadType;
      state.totalCalls = Math.max(state.totalCalls, vr.totalCalls);
      if (vr.isBadPhone) state.hasBadPhone = true;
      if (vr.vendor) state.vendor = vr.vendor;
      if (vr.lastCallStr) state.lastCallStr = vr.lastCallStr;
      if (vr.externalId && !state.externalId) state.externalId = vr.externalId;
    }

    // Merge date fields: keep earliest contact/quote/sold that is actually set.
    if (vr.isContact && vr.firstCallStr) {
      if (!state.firstContactDate || vr.firstCallStr < state.firstContactDate) {
        state.firstContactDate = vr.firstCallStr;
      }
    }
    if (vr.isQuote && vr.firstCallStr && !state.existing?.first_quote_date && !state.firstQuoteDate) {
      state.firstQuoteDate = vr.firstCallStr;
      state.callsAtFirstQuote = vr.totalCalls;
    }
    if (vr.isSold && vr.firstCallStr && !state.existing?.first_sold_date && !state.firstSoldDate) {
      state.firstSoldDate = vr.firstCallStr;
      state.callsAtFirstSold = vr.totalCalls;
    }
  }

  // ── Phase 3: Batch-insert new leads ─────────────────────────────────────
  onProgress?.({ phase: 'Creating new leads…', processed: 0, total: validRows.length });

  const newStates = [...leadStates.values()].filter((s) => s.isNew);
  const INSERT_BATCH = 100;
  for (let i = 0; i < newStates.length; i += INSERT_BATCH) {
    const batch = newStates.slice(i, i + INSERT_BATCH);
    const inserts = batch.map((s) => ({
      agency_id: agencyId,
      normalized_phone: s.phone,
      raw_phone: s.phoneRaw,
      lead_id_external: s.externalId || null,
      current_lead_type: s.leadType,
      current_status: s.leadStatus,
      first_seen_date: s.createdAtStr,
      first_deer_dama_date: s.createdAtStr,
      latest_call_date: s.lastCallStr,
      latest_vendor_name: s.vendor,
      total_call_attempts: s.totalCalls,
      has_bad_phone: s.hasBadPhone,
      first_contact_date: s.firstContactDate,
      first_quote_date: s.firstQuoteDate,
      first_sold_date: s.firstSoldDate,
      calls_at_first_quote: s.callsAtFirstQuote,
      calls_at_first_sold: s.callsAtFirstSold,
    }));

    const { data: created, error: createErr } = await supabase
      .from('leads')
      .insert(inserts)
      .select('id, normalized_phone');

    if (createErr) {
      errors.push(`New-lead batch error: ${createErr.message}`);
      continue;
    }

    for (const row of created ?? []) {
      const s = leadStates.get(row.normalized_phone);
      if (s) {
        s.id = row.id;
        newLeads++;
      }
    }
  }

  // ── Phase 4: Update existing leads ──────────────────────────────────────
  onProgress?.({ phase: 'Updating existing leads…', processed: 0, total: validRows.length });

  const toUpdate = [...leadStates.values()].filter((s) => !s.isNew && s.id);
  for (const s of toUpdate) {
    const updates: Record<string, unknown> = {
      current_status: s.leadStatus,
      current_lead_type: s.leadType,
      total_call_attempts: s.totalCalls,
    };
    if (s.vendor) updates.latest_vendor_name = s.vendor;
    if (s.externalId) updates.lead_id_external = s.externalId;
    if (s.lastCallStr) updates.latest_call_date = s.lastCallStr;
    if (s.hasBadPhone) updates.has_bad_phone = true;
    if (s.createdAtStr) updates.first_deer_dama_date = s.createdAtStr;
    if (!s.existing?.first_quote_date && s.firstQuoteDate) {
      updates.first_quote_date = s.firstQuoteDate;
      updates.calls_at_first_quote = s.callsAtFirstQuote;
    }
    if (!s.existing?.first_sold_date && s.firstSoldDate) {
      updates.first_sold_date = s.firstSoldDate;
      updates.calls_at_first_sold = s.callsAtFirstSold;
    }
    if (s.firstContactDate && (!s.existing?.first_contact_date || s.firstContactDate < s.existing.first_contact_date)) {
      updates.first_contact_date = s.firstContactDate;
    }

    const { error } = await supabase.from('leads').update(updates).eq('id', s.id);
    if (error) errors.push(`Update lead ${s.id}: ${error.message}`);
    else updatedLeads++;
  }

  // ── Phase 5: Resolve staff IDs + batch-insert raw rows & staff history ─
  onProgress?.({ phase: 'Saving raw rows…', processed: 0, total: validRows.length });

  const uniqueOwners = [...new Set(validRows.map((r) => r.leadOwner).filter(Boolean))];
  const staffIds = new Map<string, string | null>();
  for (const owner of uniqueOwners) {
    staffIds.set(owner, await getOrCreateStaff(owner, agencyId));
  }

  const rawBatch: Record<string, unknown>[] = [];
  const historyBatch: Record<string, unknown>[] = [];

  for (const vr of validRows) {
    const state = leadStates.get(vr.phone);
    if (!state?.id) {
      rowsSkipped++;
      continue;
    }

    rawBatch.push({
      upload_id: uploadId,
      row_number: vr.rowNum,
      lead_id_external: vr.externalId || null,
      full_name: vr.fullName,
      first_name: str(vr.raw['First Name']),
      last_name: str(vr.raw['Last Name']),
      email: str(vr.raw['Email']),
      address: str(vr.raw['Address']),
      lead_status: vr.leadStatus,
      lead_owner: vr.leadOwner,
      created_at_source: vr.createdAtStr,
      vendor: vr.vendor,
      first_call_date: vr.firstCallStr,
      last_call_date: vr.lastCallStr,
      total_calls: vr.totalCalls,
      phone_main: vr.phoneRaw,
      normalized_phone: vr.phone,
      lead_main_state: str(vr.raw['Lead Main State']),
      matched_lead_id: state.id,
      match_rule: state.matchRule,
      processing_status: 'matched',
      raw_data: vr.raw,
    });

    const staffId = vr.leadOwner ? staffIds.get(vr.leadOwner) ?? null : null;
    if (staffId) {
      historyBatch.push({
        lead_id: state.id,
        staff_id: staffId,
        source_type: 'deer_dama',
        source_upload_id: uploadId,
        first_seen_date: vr.createdAtStr ?? new Date().toISOString().split('T')[0],
      });
    }

    rowsImported++;
  }

  const WRITE_BATCH = 500;
  for (let i = 0; i < rawBatch.length; i += WRITE_BATCH) {
    const { error } = await supabase
      .from('raw_deer_dama_rows')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(rawBatch.slice(i, i + WRITE_BATCH) as any);
    if (error) errors.push(`raw_deer_dama_rows batch error: ${error.message}`);
  }
  for (let i = 0; i < historyBatch.length; i += WRITE_BATCH) {
    const { error } = await supabase
      .from('lead_staff_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(historyBatch.slice(i, i + WRITE_BATCH) as any);
    if (error) errors.push(`lead_staff_history batch error: ${error.message}`);
  }

  await supabase
    .from('uploads')
    .update({
      status: errors.length > 0 ? 'complete_with_errors' : 'complete',
      matched_count: rowsImported,
      unmatched_count: rowsSkipped,
      error_count: errors.length,
    })
    .eq('id', uploadId);

  return {
    uploadId,
    rowsTotal: rows.length,
    rowsImported,
    rowsFiltered: 0,
    rowsSkipped,
    newLeads,
    updatedLeads,
    errors: errors.slice(0, 20),
  };
}

/**
 * Import a Daily Call Report and a Deer Dama (Lead) Report as an atomic batch.
 * Both uploads share a batch_id. If the second importer fails, the first
 * upload is cascade-deleted so no half-imported state remains.
 */
export async function importBatch(
  dailyCallFile: File,
  deerDamaFile: File,
  agencyId: string,
  uploadDate: string,
  notes: string,
  onProgress: (p: BatchProgress) => void,
  force: boolean,
): Promise<BatchResult> {
  const batchId = crypto.randomUUID();

  // Duplicate check both files BEFORE any write so we can prompt once.
  if (!force) {
    const [dailyHash, deerHash] = await Promise.all([
      computeFileHash(dailyCallFile),
      computeFileHash(deerDamaFile),
    ]);
    const [dailyDupe, deerDupe] = await Promise.all([
      findDuplicateUpload(dailyHash, agencyId),
      findDuplicateUpload(deerHash, agencyId),
    ]);
    if (dailyDupe || deerDupe) {
      return {
        batchId,
        dailyCall: emptyResult(),
        deerDama: emptyResult(),
        rolledBack: false,
        duplicateOf: {
          dailyCall: dailyDupe ?? undefined,
          deerDama: deerDupe ?? undefined,
        },
      };
    }
  }

  // Phase 1: Daily Call
  const dailyCall = await importDailyCallReport(
    dailyCallFile,
    agencyId,
    uploadDate,
    notes,
    (p) => onProgress({ currentFile: 'daily_call', fileIndex: 1, ...p }),
    force,
    batchId,
  );

  if (dailyCall.errors.length > 0 && dailyCall.rowsImported === 0) {
    // Daily Call failed outright. Wipe its uploads row (and any derived rows)
    // via batch_id so no orphaned record remains.
    await safeRollback(batchId);
    throw new BatchRollbackError(
      'daily_call',
      new Error(dailyCall.errors.join('; ')),
    );
  }

  // Phase 2: Deer Dama
  let deerDama: ImportResult;
  try {
    deerDama = await importDeerDamaReport(
      deerDamaFile,
      agencyId,
      uploadDate,
      notes,
      (p) => onProgress({ currentFile: 'deer_dama', fileIndex: 2, ...p }),
      force,
      batchId,
    );
  } catch (err) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'deer_dama',
      err instanceof Error ? err : new Error(String(err)),
      rollbackErr ?? undefined,
    );
  }

  if (deerDama.errors.length > 0 && deerDama.rowsImported === 0) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'deer_dama',
      new Error(deerDama.errors.join('; ')),
      rollbackErr ?? undefined,
    );
  }

  return { batchId, dailyCall, deerDama, rolledBack: false };
}

/** Fire-and-forget rollback; returns the error (if any) without throwing. */
async function safeRollback(batchId: string): Promise<Error | null> {
  try {
    await deleteBatch(batchId);
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

function emptyResult(): ImportResult {
  return {
    uploadId: '',
    rowsTotal: 0,
    rowsImported: 0,
    rowsFiltered: 0,
    rowsSkipped: 0,
    newLeads: 0,
    updatedLeads: 0,
    errors: [],
  };
}

/**
 * Delete a single upload row. Cascade FKs wipe all derived rows
 * (call_events, status_events, lead_identity_links, lead_staff_history,
 * quote_events, callback_events) and the raw_*_rows staging tables.
 *
 * Throws on RLS denial or network error.
 */
export async function deleteUpload(uploadId: string): Promise<void> {
  const { error } = await supabase.from('uploads').delete().eq('id', uploadId);
  if (error) throw new Error('Failed to delete upload: ' + error.message);
}

/**
 * Delete both uploads in a batch in one query. Used by the Upload Center
 * trash button and by importBatch's rollback path.
 */
export async function deleteBatch(batchId: string): Promise<void> {
  const { error } = await supabase.from('uploads').delete().eq('batch_id', batchId);
  if (error) throw new Error('Failed to delete upload batch: ' + error.message);
}
