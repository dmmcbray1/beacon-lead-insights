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
import type {
  RicochetMatch,
  RicochetWriteSummary,
  RicochetDecision,
} from './importRicochet';
import {
  parseRicochetFile,
  detectRicochetMatches,
  writeRicochetPhase,
  commitRicochetOverwrites,
} from './importRicochet';
import type { RicochetRow, RicochetRowParseError } from './ricochetParser';
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

// Shared shape for rows skipped because their phone isn't present in `leads`.
// Used by both importDailyCallReport and importDeerDamaReport — both bulk-
// insert these into the `import_errors` table at the end of their runs.
type UnmatchedError = {
  upload_id: string;
  row_number: number;
  error_type: 'phone_not_in_leads';
  error_message: string;
  raw_data: Record<string, unknown>;
};

export interface ImportResult {
  uploadId: string;
  rowsTotal: number;
  rowsImported: number;
  rowsFiltered: number;
  rowsSkipped: number;
  rowsSkippedUnmatched?: number;
  newLeads: number;
  updatedLeads: number;
  errors: string[];
  requoteLeadsCreated?: number;
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
  currentFile: 'ricochet' | 'daily_call' | 'deer_dama';
  fileIndex: 0 | 1 | 2;
  phase: string;
  processed: number;
  total: number;
}

export interface BatchResult {
  batchId: string;
  ricochet?: RicochetWriteSummary;
  dailyCall: ImportResult;
  deerDama: ImportResult;
  rolledBack: boolean;
  rollbackError?: string;
  /**
   * Populated when any file is a duplicate of a previously-imported file
   * and `force` was false. When set, no rows were imported for any file —
   * the caller should prompt the user and re-invoke importBatch with force: true.
   */
  duplicateOf?: {
    ricochet?: { uploadId: string; fileName: string; uploadDate: string };
    dailyCall?: { uploadId: string; fileName: string; uploadDate: string };
    deerDama?: { uploadId: string; fileName: string; uploadDate: string };
  };
}

export class BatchRollbackError extends Error {
  constructor(
    public readonly failedFile: 'ricochet' | 'daily_call' | 'deer_dama',
    public readonly originalError: Error,
    public readonly rollbackError?: Error,
  ) {
    super(
      `Batch failed on ${failedFile}: ${originalError.message}` +
        (rollbackError
          ? ` — rollback also failed (${rollbackError.message}). Some upload rows may remain in "processing" state; use Clear Stuck Uploads in the Upload Center to remove them.`
          : ''),
    );
    this.name = 'BatchRollbackError';
  }
}

export type RequoteDecision = RicochetDecision;

export interface ParsedBatchState {
  ricochetFile: File;
  ricochetRows: RicochetRow[];
  ricochetParseErrors: RicochetRowParseError[];
  existingMatches: RicochetMatch[];
  dailyCallFile: File;
  deerDamaFile: File;
}

export type ImportBatchResult =
  | { status: 'success'; result: BatchResult }
  | { status: 'duplicate'; duplicateOf: NonNullable<BatchResult['duplicateOf']> }
  | {
      status: 'needs_requote_review';
      pendingBatchId: string;
      matches: RicochetMatch[];
      parsedState: ParsedBatchState;
    };

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
    .limit(1)
    .returns<{ id: string; file_name: string; upload_date: string }[]>();
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
  type Row = {
    id: string;
    normalized_phone: string;
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
  };

  const map = new Map<string, Row>();
  if (phones.length === 0) return map;

  // Chunk the IN clause so multi-day imports don't exceed PostgREST URL limits
  // or the default 1000-row cap, which would otherwise leave existing leads
  // unmatched and trigger the (agency_id, normalized_phone) unique constraint.
  const LOOKUP_BATCH = 500;
  for (let i = 0; i < phones.length; i += LOOKUP_BATCH) {
    const chunk = phones.slice(i, i + LOOKUP_BATCH);
    const { data } = await supabase
      .from('leads')
      .select(
        'id, normalized_phone, total_call_attempts, total_callbacks, total_voicemails, has_bad_phone, first_seen_date, first_contact_date, first_callback_date, first_quote_date, first_sold_date, first_daily_call_date, latest_call_date',
      )
      .eq('agency_id', agencyId)
      .in('normalized_phone', chunk);
    for (const row of (data ?? []) as Row[]) {
      map.set(row.normalized_phone, row);
    }
  }
  return map;
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

  // ── Phase 2b: Skip rows whose phone is not in leads ───────────────────────
  // Phase 0 (Ricochet) is the authoritative source of new leads. Any Daily
  // Call row whose phone is not present in `leads` (either pre-existing or
  // just created by Phase 0) is logged to `import_errors` and dropped here
  // BEFORE any derived-table writes (leads / call_events / raw rows).
  //
  // Exception: rows that qualify as 7.1 Shark Tank requotes from specific
  // vendors will auto-create a lead marked as re_quote before continuing.
  //
  // This runs regardless of `force`: it only affects rows whose phone is
  // missing from leads, not duplicate-file re-imports.

  // ── Requote auto-creation constants ────────────────────────────────────────
  // Substrings (lowercased) that mark a row as a campaign / requote call.
  // Includes Shark Tank family, any Cam-Q suffix (with or without spaces),
  // and inbound calls (which always come from a known caller).
  const REQUOTE_AUTO_CREATE_CALL_TYPES = [
    'shark tank',
    'cam-q',
    'cam - q',
    'inbound call',
  ];
  const REQUOTE_AUTO_CREATE_VENDORS = [
    'new-home-to-beacon-territory-list-upload',
    'new-home-priority-list',
    'live-leads-priority-list-uploads',
    'requote-for-list-uploads',
    'imported-for-list-uploads',
    'referrals',
  ];

  function shouldAutoCreateRequote(callType: string, vendorName: string): boolean {
    const ct = callType.trim().toLowerCase();
    const vn = vendorName.trim().toLowerCase();
    return (
      REQUOTE_AUTO_CREATE_CALL_TYPES.some((t) => ct.includes(t)) &&
      REQUOTE_AUTO_CREATE_VENDORS.some((v) => vn === v)
    );
  }

  const unmatchedErrors: UnmatchedError[] = [];
  const matchedRows: typeof validRows = [];
  let requoteLeadsCreated = 0;

  for (const vr of validRows) {
    if (existingMap.has(vr.phone)) {
      matchedRows.push(vr);
      continue;
    }
    // Check if this row qualifies for requote auto-creation
    if (shouldAutoCreateRequote(vr.callType, vr.vendorName)) {
      try {
        // Guarantee a non-null first_seen_date so the lead remains visible
        // in date-bounded views (ROI, dashboards) even when the source CSV
        // had an empty Date column.
        const seenDate = vr.callDateStr ?? new Date().toISOString().slice(0, 10);
        const { data: newLead, error: newLeadErr } = await supabase
          .from('leads')
          .insert({
            agency_id: agencyId,
            normalized_phone: vr.phone,
            current_lead_type: 're_quote',
            current_status: '9.1 REQUOTE',
            latest_vendor_name: vr.vendorName,
            first_seen_date: seenDate,
          })
          .select('id')
          .single();

        if (newLeadErr || !newLead) {
          errors.push(`Auto-create requote failed for phone=${vr.phone}: ${newLeadErr?.message ?? 'unknown'}`);
          unmatchedErrors.push({
            upload_id: uploadId,
            row_number: vr.rowNum,
            error_type: 'phone_not_in_leads',
            error_message: vr.phone ? `phone=${vr.phone} not found in leads (requote create failed)` : 'phone missing',
            raw_data: vr.raw,
          });
        } else {
          existingMap.set(vr.phone, {
            id: (newLead as { id: string }).id,
            total_call_attempts: 0,
            total_callbacks: 0,
            total_voicemails: 0,
            has_bad_phone: false,
            first_seen_date: seenDate,
            first_contact_date: null,
            first_callback_date: null,
            first_quote_date: null,
            first_sold_date: null,
            first_daily_call_date: null,
            latest_call_date: null,
          });
          matchedRows.push(vr);
          requoteLeadsCreated++;
        }
      } catch (e) {
        errors.push(`Auto-create requote exception for phone=${vr.phone}: ${String(e)}`);
        unmatchedErrors.push({
          upload_id: uploadId,
          row_number: vr.rowNum,
          error_type: 'phone_not_in_leads',
          error_message: vr.phone ? `phone=${vr.phone} not found in leads` : 'phone missing',
          raw_data: vr.raw,
        });
      }
    } else {
      unmatchedErrors.push({
        upload_id: uploadId,
        row_number: vr.rowNum,
        error_type: 'phone_not_in_leads',
        error_message: vr.phone ? `phone=${vr.phone} not found in leads` : 'phone missing',
        raw_data: vr.raw,
      });
    }
  }
  const rowsSkippedUnmatched = unmatchedErrors.length;

  // Per-lead accumulated state for leads we're updating this run.
  // After the phone_not_in_leads filter above, every phone in matchedRows
  // already has a corresponding row in existingMap — so there is no "new
  // lead" branch here. Ricochet (Phase 0) is the authoritative source of
  // new leads. (Exception: requote auto-creation above adds to existingMap.)
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

  for (const vr of matchedRows) {
    const existing = existingMap.get(vr.phone)!;

    if (!leadStates.has(vr.phone)) {
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
      });
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

  // Ricochet (Phase 0) is the only source of new leads — Daily Call never
  // inserts into `leads`. Rows without a matching phone were already dropped
  // in Phase 2b above.
  const newLeads = 0;

  // ── Phase 3: Update existing leads ────────────────────────────────────────

  let updatedLeads = 0;
  const toUpdate = [...leadStates.entries()];

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

  // ── Phase 4: Insert call_events ───────────────────────────────────────────

  onProgress?.({ phase: 'Saving call events…', processed: 0, total: matchedRows.length });

  let rowsImported = 0;
  let rowsSkipped = 0;

  // Pre-fetch staff IDs for all unique user names
  const uniqueUsers = [...new Set(matchedRows.map((r) => r.userName).filter(Boolean))];
  const staffIds = new Map<string, string | null>();
  for (const user of uniqueUsers) {
    staffIds.set(user, await getOrCreateStaff(user, agencyId));
  }

  // Build call_events array
  const callEventBatch: Record<string, unknown>[] = [];
  const rawRowBatch: Record<string, unknown>[] = [];

  // Inbound dedup: only count 1 inbound call per phone number per calendar day
  const seenInboundKeys = new Set<string>();

  for (const vr of matchedRows) {
    const state = leadStates.get(vr.phone);
    if (!state?.id) {
      rowsSkipped++;
      continue;
    }

    // Deduplicate inbound calls: skip if we've already seen an inbound call
    // for this phone on this calendar day
    if (vr.isInbound && vr.callDateStr) {
      const dedupKey = `${vr.phone}|${vr.callDateStr}`;
      if (seenInboundKeys.has(dedupKey)) {
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
          processing_status: 'suppressed_duplicate',
          raw_data: vr.raw,
        });
        rowsSkipped++;
        continue;
      }
      seenInboundKeys.add(dedupKey);
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

  // Persist unmatched-phone skips to import_errors so users can investigate
  // rows that were dropped because their phone isn't in the lead set.
  if (unmatchedErrors.length > 0) {
    const ERR_BATCH = 500;
    for (let i = 0; i < unmatchedErrors.length; i += ERR_BATCH) {
      const { error } = await supabase
        .from('import_errors')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(unmatchedErrors.slice(i, i + ERR_BATCH) as any);
      if (error) errors.push(`import_errors batch error: ${error.message}`);
    }
  }

  // Finalise upload record
  await supabase
    .from('uploads')
    .update({
      status: errors.length > 0 ? 'complete_with_errors' : 'complete',
      matched_count: rowsImported,
      unmatched_count: rowsSkipped + rowsFiltered + rowsSkippedUnmatched,
      error_count: errors.length,
    })
    .eq('id', uploadId);

  return {
    uploadId,
    rowsTotal: rows.length,
    rowsImported,
    rowsFiltered,
    rowsSkipped,
    rowsSkippedUnmatched,
    newLeads,
    updatedLeads,
    errors: errors.slice(0, 20),
    requoteLeadsCreated,
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

  // ── Phase 1b: Skip rows whose phone is not in leads ────────────────────
  // Phase 0 (Ricochet) is the authoritative source of new leads. Any Deer
  // Dama row whose phone is not present in `leads` (either pre-existing or
  // just created by Phase 0) is logged to `import_errors` and dropped here
  // BEFORE any derived-table writes (leads upserts / raw rows / staff
  // history).
  //
  // This runs regardless of `force`: it only affects rows whose phone is
  // missing from leads, not duplicate-file re-imports.

  onProgress?.({ phase: 'Looking up existing leads…', processed: 0, total: validRows.length });

  const allPhones = [...new Set(validRows.map((r) => r.phone))];
  const existingPhoneMap = await bulkLookupLeadsByPhone(allPhones, agencyId);

  // Deer Dama files are historic customer/lead exports — any phone not yet
  // in `leads` represents an older lead that should be created as `re_quote`
  // so the associated call activity has somewhere to attach.
  const unmatchedErrors: UnmatchedError[] = [];
  const matchedRows: typeof validRows = [];
  let requoteLeadsCreated = 0;

  for (const vr of validRows) {
    if (existingPhoneMap.has(vr.phone)) {
      matchedRows.push(vr);
      continue;
    }
    try {
      // Guarantee a non-null first_seen_date so the lead remains visible
      // in date-bounded views (ROI, dashboards) even when both Created At
      // and First Call Date were blank in the CSV.
      const seenDate = vr.createdAtStr ?? vr.firstCallStr ?? new Date().toISOString().slice(0, 10);
      const { data: newLead, error: newLeadErr } = await supabase
        .from('leads')
        .insert({
          agency_id: agencyId,
          normalized_phone: vr.phone,
          current_lead_type: 're_quote',
          current_status: vr.leadStatus || '9.1 REQUOTE',
          latest_vendor_name: vr.vendor || 'requote',
          first_seen_date: seenDate,
        })
        .select('id')
        .single();

      if (newLeadErr || !newLead) {
        errors.push(`Auto-create requote failed for phone=${vr.phone}: ${newLeadErr?.message ?? 'unknown'}`);
        unmatchedErrors.push({
          upload_id: uploadId,
          row_number: vr.rowNum,
          error_type: 'phone_not_in_leads',
          error_message: vr.phone ? `phone=${vr.phone} not found in leads (requote create failed)` : 'phone missing',
          raw_data: vr.raw,
        });
      } else {
        existingPhoneMap.set(vr.phone, {
          id: newLead.id,
          total_call_attempts: 0,
          total_callbacks: 0,
          total_voicemails: 0,
          has_bad_phone: false,
          first_seen_date: seenDate,
          first_contact_date: null,
          first_callback_date: null,
          first_quote_date: null,
          first_sold_date: null,
          first_daily_call_date: null,
          latest_call_date: null,
        });
        matchedRows.push(vr);
        requoteLeadsCreated++;
      }
    } catch (e) {
      errors.push(`Auto-create requote exception for phone=${vr.phone}: ${String(e)}`);
      unmatchedErrors.push({
        upload_id: uploadId,
        row_number: vr.rowNum,
        error_type: 'phone_not_in_leads',
        error_message: vr.phone ? `phone=${vr.phone} not found in leads` : 'phone missing',
        raw_data: vr.raw,
      });
    }
  }
  const rowsSkippedUnmatched = unmatchedErrors.length;

  // ── Phase 2: Batch-lookup existing leads (by phone + by external id) ───
  type ExistingLead = {
    id: string;
    first_contact_date: string | null;
    first_quote_date: string | null;
    first_sold_date: string | null;
  };

  const uniquePhones = [...new Set(matchedRows.map((r) => r.phone))];
  const uniqueExternalIds = [...new Set(matchedRows.map((r) => r.externalId).filter(Boolean))];

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

  for (const vr of matchedRows) {
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
  onProgress?.({ phase: 'Creating new leads…', processed: 0, total: matchedRows.length });

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
  onProgress?.({ phase: 'Updating existing leads…', processed: 0, total: matchedRows.length });

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
  onProgress?.({ phase: 'Saving raw rows…', processed: 0, total: matchedRows.length });

  const uniqueOwners = [...new Set(matchedRows.map((r) => r.leadOwner).filter(Boolean))];
  const staffIds = new Map<string, string | null>();
  for (const owner of uniqueOwners) {
    staffIds.set(owner, await getOrCreateStaff(owner, agencyId));
  }

  const rawBatch: Record<string, unknown>[] = [];
  const historyBatch: Record<string, unknown>[] = [];

  for (const vr of matchedRows) {
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

  // Persist unmatched-phone skips to import_errors so users can investigate
  // rows that were dropped because their phone isn't in the lead set.
  if (unmatchedErrors.length > 0) {
    const ERR_BATCH = 500;
    for (let i = 0; i < unmatchedErrors.length; i += ERR_BATCH) {
      const { error } = await supabase
        .from('import_errors')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(unmatchedErrors.slice(i, i + ERR_BATCH) as any);
      if (error) errors.push(`import_errors batch error: ${error.message}`);
    }
  }

  await supabase
    .from('uploads')
    .update({
      status: errors.length > 0 ? 'complete_with_errors' : 'complete',
      matched_count: rowsImported,
      unmatched_count: rowsSkipped + rowsSkippedUnmatched,
      error_count: errors.length,
    })
    .eq('id', uploadId);

  return {
    uploadId,
    rowsTotal: rows.length,
    rowsImported,
    rowsFiltered: 0,
    rowsSkipped,
    rowsSkippedUnmatched,
    newLeads,
    updatedLeads,
    errors: errors.slice(0, 20),
    requoteLeadsCreated,
  };
}

/**
 * Import a Daily Call Report and a Deer Dama (Lead) Report as an atomic batch.
 * Both uploads share a batch_id. If the second importer fails, the first
 * upload is cascade-deleted so no half-imported state remains.
 */
/**
 * Orchestrate a three-phase batch import: Ricochet (Phase 0), Daily Call
 * (Phase 1), and Deer Dama (Phase 2). Runs Phase 0 parse + match detection
 * up front and pauses with `status: 'needs_requote_review'` if any incoming
 * Ricochet rows match existing leads — the caller must then collect user
 * decisions and invoke `resumeBatch` to commit.
 *
 * When no matches exist (or `force: true` is irrelevant to matches), runs
 * straight through to completion.
 *
 * Returns a discriminated union:
 *   - `{ status: 'success', result }`           — all three phases committed
 *   - `{ status: 'duplicate', duplicateOf }`    — one or more file hashes
 *                                                 collide with a prior upload
 *                                                 (no writes occurred)
 *   - `{ status: 'needs_requote_review', … }`   — Phase 0 detected existing
 *                                                 matches; caller must resume
 *                                                 (no writes occurred)
 */
export async function importBatch(params: {
  ricochetFile: File;
  dailyCallFile: File;
  deerDamaFile: File;
  agencyId: string;
  uploadDate: string;
  notes: string;
  onProgress: (p: BatchProgress) => void;
  force: boolean;
}): Promise<ImportBatchResult> {
  const {
    ricochetFile,
    dailyCallFile,
    deerDamaFile,
    agencyId,
    uploadDate,
    notes,
    onProgress,
    force,
  } = params;

  const batchId = crypto.randomUUID();

  // Duplicate check all three files BEFORE any write so we can prompt once.
  if (!force) {
    const [ricoHash, dailyHash, deerHash] = await Promise.all([
      computeFileHash(ricochetFile),
      computeFileHash(dailyCallFile),
      computeFileHash(deerDamaFile),
    ]);
    const [ricoDupe, dailyDupe, deerDupe] = await Promise.all([
      findDuplicateUpload(ricoHash, agencyId),
      findDuplicateUpload(dailyHash, agencyId),
      findDuplicateUpload(deerHash, agencyId),
    ]);
    if (ricoDupe || dailyDupe || deerDupe) {
      return {
        status: 'duplicate',
        duplicateOf: {
          ricochet: ricoDupe ?? undefined,
          dailyCall: dailyDupe ?? undefined,
          deerDama: deerDupe ?? undefined,
        },
      };
    }
  }

  // ---------- Phase 0 (read-only): parse Ricochet + detect matches ----------
  onProgress({
    currentFile: 'ricochet',
    fileIndex: 0,
    phase: 'Parsing Ricochet file…',
    processed: 0,
    total: 0,
  });

  const parsed = await parseRicochetFile(ricochetFile);

  onProgress({
    currentFile: 'ricochet',
    fileIndex: 0,
    phase: 'Detecting existing leads…',
    processed: 0,
    total: parsed.rows.length,
  });

  const matches = await detectRicochetMatches(parsed.rows, agencyId);

  if (matches.length > 0) {
    // Pause for interactive requote review. No DB writes have happened.
    return {
      status: 'needs_requote_review',
      pendingBatchId: batchId,
      matches,
      parsedState: {
        ricochetFile,
        ricochetRows: parsed.rows,
        ricochetParseErrors: parsed.errors,
        existingMatches: matches,
        dailyCallFile,
        deerDamaFile,
      },
    };
  }

  // No matches — default every row to a "new lead" write and commit straight
  // through.
  return finalizeBatch({
    batchId,
    agencyId,
    uploadDate,
    notes,
    ricochetFile,
    parsedRicochet: parsed,
    existingMatches: [],
    decisions: new Map(),
    dailyCallFile,
    deerDamaFile,
    onProgress,
    force,
  });
}

/**
 * Shared commit path for both the straight-through and the post-review
 * (resumeBatch) cases. Performs Phase 0 writes, then Phase 1 (Daily Call),
 * then Phase 2 (Deer Dama). Any failure triggers a full `safeRollback` via
 * the shared `batchId`, which cascades through every uploads row (including
 * the Ricochet uploads row inserted here).
 */
interface FinalizeParams {
  batchId: string;
  agencyId: string;
  uploadDate: string;
  notes: string;
  ricochetFile: File;
  parsedRicochet: { rows: RicochetRow[]; errors: RicochetRowParseError[] };
  existingMatches: RicochetMatch[];
  decisions: Map<string, RicochetDecision>;
  dailyCallFile: File;
  deerDamaFile: File;
  onProgress: (p: BatchProgress) => void;
  force: boolean;
}

async function finalizeBatch(p: FinalizeParams): Promise<ImportBatchResult> {
  const {
    batchId,
    agencyId,
    uploadDate,
    notes,
    ricochetFile,
    parsedRicochet,
    existingMatches,
    decisions,
    dailyCallFile,
    deerDamaFile,
    onProgress,
    force,
  } = p;

  // ---------- Phase 0: Ricochet ----------
  let ricochetSummary: RicochetWriteSummary;
  try {
    onProgress({
      currentFile: 'ricochet',
      fileIndex: 0,
      phase: 'Writing Ricochet rows…',
      processed: 0,
      total: parsedRicochet.rows.length,
    });

    // The orchestrator creates the uploads row for Ricochet (unlike DC/DD,
    // which create their own) because writeRicochetPhase expects uploadId
    // pre-set for its raw_ricochet_rows inserts.
    const ricoHash = await computeFileHash(ricochetFile);
    const { data: upRow, error: upErr } = await supabase
      .from('uploads')
      .insert({
        agency_id: agencyId,
        file_name: ricochetFile.name,
        report_type: REPORT_TYPES.RICOCHET_LEAD_LIST,
        upload_date: uploadDate,
        notes,
        status: 'processing',
        row_count: parsedRicochet.rows.length,
        // Match DC/DD pattern: store hash only when not forcing; `force=true`
        // means the user overrode and we leave hash null so subsequent
        // imports of the same file aren't flagged.
        file_hash: force ? null : ricoHash,
        batch_id: batchId,
      })
      .select('id')
      .single();
    if (upErr || !upRow) {
      throw new Error(
        'Failed to create Ricochet upload record: ' +
          (upErr?.message ?? 'unknown error'),
      );
    }
    const ricochetUploadId = upRow.id as string;

    const matchMap = new Map<string, RicochetMatch['existing']>(
      existingMatches.map((m) => [m.incoming.phoneNormalized, m.existing]),
    );

    ricochetSummary = await writeRicochetPhase({
      uploadId: ricochetUploadId,
      batchId,
      agencyId,
      rows: parsedRicochet.rows,
      existingMatches: matchMap,
      decisions,
      parseErrors: parsedRicochet.errors,
    });

    await supabase
      .from('uploads')
      .update({
        status:
          ricochetSummary.errors.length > 0 ? 'complete_with_errors' : 'complete',
        matched_count: ricochetSummary.rowsUpdated,
        unmatched_count: ricochetSummary.rowsImported,
        error_count: ricochetSummary.errors.length,
      })
      .eq('id', ricochetUploadId);
  } catch (err) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'ricochet',
      err instanceof Error ? err : new Error(String(err)),
      rollbackErr ?? undefined,
    );
  }

  // ---------- Phase 1: Daily Call ----------
  // The hash check was already done in importBatch, so force=true here keeps
  // the per-importer from re-flagging the duplicate (its fallback still runs
  // but returns a no-op). However, per DC/DD semantics, `force=true` causes
  // them to write `file_hash: null`. To preserve future dedup detection we
  // pass the caller's original `force` — the per-importer's redundant dup
  // check will be a no-op since the prior duplicate was already rejected in
  // importBatch.
  let dailyCall: ImportResult;
  try {
    dailyCall = await importDailyCallReport(
      dailyCallFile,
      agencyId,
      uploadDate,
      notes,
      (pg) =>
        onProgress({
          currentFile: 'daily_call',
          fileIndex: 1,
          ...pg,
        }),
      force,
      batchId,
    );
    if (dailyCall.errors.length > 0 && dailyCall.rowsImported === 0) {
      throw new Error(dailyCall.errors.join('; '));
    }
  } catch (err) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'daily_call',
      err instanceof Error ? err : new Error(String(err)),
      rollbackErr ?? undefined,
    );
  }

  // ---------- Phase 2: Deer Dama ----------
  let deerDama: ImportResult;
  try {
    deerDama = await importDeerDamaReport(
      deerDamaFile,
      agencyId,
      uploadDate,
      notes,
      (pg) =>
        onProgress({
          currentFile: 'deer_dama',
          fileIndex: 2,
          ...pg,
        }),
      force,
      batchId,
    );
    if (deerDama.errors.length > 0 && deerDama.rowsImported === 0) {
      throw new Error(deerDama.errors.join('; '));
    }
  } catch (err) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'deer_dama',
      err instanceof Error ? err : new Error(String(err)),
      rollbackErr ?? undefined,
    );
  }

  // ---------- Commit: apply deferred Ricochet overwrite UPDATEs ----------
  // These were collected (not applied) in Phase 0 so a Phase 1/2 failure
  // could rollback without leaving pre-existing leads in a half-overwritten
  // state. Apply them now that both Phase 1 and Phase 2 have succeeded.
  try {
    await commitRicochetOverwrites(ricochetSummary.pendingOverwrites);
  } catch (err) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'ricochet',
      err instanceof Error ? err : new Error(String(err)),
      rollbackErr ?? undefined,
    );
  }

  return {
    status: 'success',
    result: {
      batchId,
      ricochet: ricochetSummary,
      dailyCall,
      deerDama,
      rolledBack: false,
    },
  };
}

/**
 * Resume a paused batch after the user has reviewed requote matches and
 * chosen 'requote' or 'overwrite' for each. Uses the same `pendingBatchId`
 * issued by the initial `importBatch` call so rollback and duplicate-hash
 * semantics stay consistent.
 */
export async function resumeBatch(params: {
  pendingBatchId: string;
  decisions: Map<string, RicochetDecision>;
  parsedState: ParsedBatchState;
  agencyId: string;
  uploadDate: string;
  notes: string;
  onProgress: (p: BatchProgress) => void;
  force: boolean;
}): Promise<ImportBatchResult> {
  const {
    pendingBatchId,
    decisions,
    parsedState,
    agencyId,
    uploadDate,
    notes,
    onProgress,
    force,
  } = params;

  return finalizeBatch({
    batchId: pendingBatchId,
    agencyId,
    uploadDate,
    notes,
    ricochetFile: parsedState.ricochetFile,
    parsedRicochet: {
      rows: parsedState.ricochetRows,
      errors: parsedState.ricochetParseErrors,
    },
    existingMatches: parsedState.existingMatches,
    decisions,
    dailyCallFile: parsedState.dailyCallFile,
    deerDamaFile: parsedState.deerDamaFile,
    onProgress,
    force,
  });
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

/**
 * Delete a single upload row. Cascade FKs wipe all derived rows
 * (call_events, status_events, lead_identity_links, lead_staff_history,
 * quote_events, callback_events) and the raw_*_rows staging tables.
 *
 * Throws on RLS denial or network error.
 */
/**
 * Delete sales_events tied to an upload, then delete any auto-created
 * re_quote leads whose only source was that upload (lead_id on the event
 * points back to a lead with no call history). For remaining matched
 * leads (those with call history that had sales data written to them),
 * reset the denormalized sold fields to NULL.
 */
async function deleteSalesLogData(uploadIds: string[]): Promise<void> {
  if (uploadIds.length === 0) return;

  // 1. Find leads linked to sales_events for these uploads
  const { data: events, error: eventsErr } = await supabase
    .from('sales_events')
    .select('lead_id')
    .in('upload_id', uploadIds);

  if (eventsErr) {
    throw new Error('Failed to read sales_events for cleanup: ' + eventsErr.message);
  }

  const linkedLeadIds = [...new Set(
    (events ?? [])
      .map((e: { lead_id: string | null }) => e.lead_id)
      .filter((id): id is string => Boolean(id))
  )];

  // 2. Delete sales_events first so the FK from sales_events.lead_id ->
  //    leads.id doesn't hold references when we delete the auto-created
  //    leads below. (FK is ON DELETE SET NULL, so either order works, but
  //    doing events first keeps the lead delete clean and avoids
  //    transiently orphaned rows.)
  const { error: eventsDelErr } = await supabase
    .from('sales_events')
    .delete()
    .in('upload_id', uploadIds);
  if (eventsDelErr) {
    throw new Error('Failed to delete sales_events: ' + eventsDelErr.message);
  }

  if (linkedLeadIds.length === 0) return;

  // 3. Of the linked leads, only delete ones with no call history —
  //    total_call_attempts = 0 means they were auto-created purely by
  //    the Sales Log importer and never touched by Daily Call / Deer Dama.
  const { data: autoLeads, error: autoLeadsErr } = await supabase
    .from('leads')
    .select('id')
    .in('id', linkedLeadIds)
    .eq('total_call_attempts', 0);

  if (autoLeadsErr) {
    throw new Error('Failed to read auto-created leads: ' + autoLeadsErr.message);
  }

  const autoCreatedIds = (autoLeads ?? []).map((l: { id: string }) => l.id);
  const autoCreatedSet = new Set(autoCreatedIds);
  if (autoCreatedIds.length > 0) {
    const { error: leadsDelErr } = await supabase
      .from('leads')
      .delete()
      .in('id', autoCreatedIds);
    if (leadsDelErr) {
      throw new Error('Failed to delete auto-created leads: ' + leadsDelErr.message);
    }
  }

  // 4. For remaining leads (matched via phone, had call history), reset the
  //    denormalized sold fields that were written by the Sales Log importer.
  //    The sales_events rows are gone, but these columns on `leads` also
  //    need clearing so Sales Tracking / ROI reflect the deletion.
  const matchedLeadIds = linkedLeadIds.filter((id) => !autoCreatedSet.has(id));
  if (matchedLeadIds.length > 0) {
    const { error: resetErr } = await supabase
      .from('leads')
      .update({
        total_items_sold: null,
        total_policies_sold: null,
        total_premium: null,
        first_sold_date: null,
      })
      .in('id', matchedLeadIds);
    if (resetErr) {
      throw new Error('Failed to reset sold fields on matched leads: ' + resetErr.message);
    }
  }
}

/**
 * Wipe all Sales Log data for an agency. Unlike deleteSalesLogData (which is
 * scoped to specific upload IDs), this clears ALL sales_events for the agency,
 * deletes any leads that look like auto-created sales log re-quotes with no
 * call activity, and resets the denormalized sold fields on every remaining
 * lead that has them set. Used to clean up orphaned sales_events rows whose
 * upload record no longer exists.
 */
/**
 * Wipe every upload, lead, and event for the agency. Preserves agencies,
 * staff_members, user_profiles, user_roles, and any global mapping tables
 * (upload_templates, disposition_mappings, call_type_mappings).
 *
 * Order:
 *   1. sales_events (FK to leads is SET NULL but cleanest to remove first)
 *   2. uploads — CASCADE clears call_events, status_events, quote_events,
 *      callback_events, lead_identity_links, lead_staff_history, raw_*_rows,
 *      lead_requote_events, import_errors
 *   3. leads (now safe; dependent rows are gone)
 */
export async function resetAgencyData(agencyId: string): Promise<{
  salesEventsDeleted: number;
  uploadsDeleted: number;
  leadsDeleted: number;
}> {
  // 1. Sales events
  const { count: salesCount, error: salesCountErr } = await supabase
    .from('sales_events')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId);
  if (salesCountErr) throw new Error('Failed to count sales_events: ' + salesCountErr.message);
  const { error: salesDelErr } = await supabase
    .from('sales_events')
    .delete()
    .eq('agency_id', agencyId);
  if (salesDelErr) throw new Error('Failed to delete sales_events: ' + salesDelErr.message);

  // 2. Uploads (cascades to events, identity links, staff history, raw_*_rows)
  const { count: uploadCount, error: uploadCountErr } = await supabase
    .from('uploads')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId);
  if (uploadCountErr) throw new Error('Failed to count uploads: ' + uploadCountErr.message);
  const { error: uploadDelErr } = await supabase
    .from('uploads')
    .delete()
    .eq('agency_id', agencyId);
  if (uploadDelErr) throw new Error('Failed to delete uploads: ' + uploadDelErr.message);

  // 3. Leads (after dependents are gone)
  const { count: leadCount, error: leadCountErr } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', agencyId);
  if (leadCountErr) throw new Error('Failed to count leads: ' + leadCountErr.message);
  const { error: leadDelErr } = await supabase
    .from('leads')
    .delete()
    .eq('agency_id', agencyId);
  if (leadDelErr) throw new Error('Failed to delete leads: ' + leadDelErr.message);

  return {
    salesEventsDeleted: salesCount ?? 0,
    uploadsDeleted: uploadCount ?? 0,
    leadsDeleted: leadCount ?? 0,
  };
}

export async function clearAllSalesData(agencyId: string): Promise<{
  salesEventsDeleted: number;
  autoLeadsDeleted: number;
  leadsReset: number;
}> {
  // 1. Delete auto-created re-quote leads with no call activity.
  //    These are leads created solely by the Sales Log importer when the
  //    incoming policy had no matching phone in `leads`.
  const { data: autoLeads, error: autoLeadsErr } = await supabase
    .from('leads')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('total_call_attempts', 0)
    .eq('current_status', '4.0 SOLD')
    .not('first_sold_date', 'is', null);

  if (autoLeadsErr) {
    throw new Error('Failed to read auto-created sales leads: ' + autoLeadsErr.message);
  }

  const autoLeadIds = (autoLeads ?? []).map((l: { id: string }) => l.id);

  // 2. Delete all sales_events for this agency.
  const { data: deletedEvents, error: eventsDelErr } = await supabase
    .from('sales_events')
    .delete()
    .eq('agency_id', agencyId)
    .select('id');
  if (eventsDelErr) {
    throw new Error('Failed to delete sales_events: ' + eventsDelErr.message);
  }

  // 3. Delete the auto-created leads (now unlinked from any sales_events).
  if (autoLeadIds.length > 0) {
    const { error: leadsDelErr } = await supabase
      .from('leads')
      .delete()
      .in('id', autoLeadIds);
    if (leadsDelErr) {
      throw new Error('Failed to delete auto-created leads: ' + leadsDelErr.message);
    }
  }

  // 4. Reset denormalized sold fields on any remaining leads in this agency
  //    that still have them set (matched leads with call history).
  const { data: resetRows, error: resetErr } = await supabase
    .from('leads')
    .update({
      total_items_sold: null,
      total_policies_sold: null,
      total_premium: null,
      first_sold_date: null,
    })
    .eq('agency_id', agencyId)
    .not('first_sold_date', 'is', null)
    .select('id');
  if (resetErr) {
    throw new Error('Failed to reset sold fields: ' + resetErr.message);
  }

  return {
    salesEventsDeleted: deletedEvents?.length ?? 0,
    autoLeadsDeleted: autoLeadIds.length,
    leadsReset: resetRows?.length ?? 0,
  };
}

/**
 * Collect lead_ids touched by these uploads via call_events or
 * lead_staff_history. Used as the candidate set for orphan-lead cleanup
 * after an upload is deleted (Daily Call / Deer Dama auto-creates).
 */
async function collectCandidateLeadIds(uploadIds: string[]): Promise<string[]> {
  if (uploadIds.length === 0) return [];

  const ids = new Set<string>();

  const { data: callRows, error: callErr } = await supabase
    .from('call_events')
    .select('lead_id')
    .in('source_upload_id', uploadIds);
  if (callErr) throw new Error('Failed to read call_events for cleanup: ' + callErr.message);
  for (const r of callRows ?? []) {
    if (r.lead_id) ids.add(r.lead_id);
  }

  const { data: histRows, error: histErr } = await supabase
    .from('lead_staff_history')
    .select('lead_id')
    .in('source_upload_id', uploadIds);
  if (histErr) throw new Error('Failed to read lead_staff_history for cleanup: ' + histErr.message);
  for (const r of histRows ?? []) {
    if (r.lead_id) ids.add(r.lead_id);
  }

  return [...ids];
}

/**
 * Recompute the denormalized aggregate fields on `leads` for the candidate
 * set from the *remaining* rows in `call_events` and `sales_events`. Run
 * AFTER the upload cascade so the source rows for the deleted upload are
 * already gone. Without this step the lead row keeps the totals it was
 * populated with at import time and dashboards (callback rate, voicemail
 * rate, no-contact rate, single-touch quote %, avg-calls-to-quote, ROI
 * sold totals, etc.) read stale numbers.
 */
async function recalcLeadAggregates(leadIds: string[]): Promise<void> {
  if (leadIds.length === 0) return;
  const CHUNK = 500;

  for (let offset = 0; offset < leadIds.length; offset += CHUNK) {
    const chunk = leadIds.slice(offset, offset + CHUNK);

    const { data: events, error: evErr } = await supabase
      .from('call_events')
      .select('lead_id, call_date, is_contact, is_callback, is_quote, is_bad_phone, is_voicemail, current_status, vendor_name')
      .in('lead_id', chunk);
    if (evErr) throw new Error('Failed to read call_events for recalc: ' + evErr.message);

    const { data: sales, error: salesErr } = await supabase
      .from('sales_events')
      .select('lead_id, sale_date, items, premium')
      .in('lead_id', chunk);
    if (salesErr) throw new Error('Failed to read sales_events for recalc: ' + salesErr.message);

    type CallAgg = {
      total_call_attempts: number;
      total_callbacks: number;
      total_voicemails: number;
      has_bad_phone: boolean;
      first_contact_date: string | null;
      first_callback_date: string | null;
      first_quote_date: string | null;
      first_daily_call_date: string | null;
      latest_call_date: string | null;
      latest_status: string | null;
      latest_vendor: string | null;
    };
    const callAgg = new Map<string, CallAgg>();
    for (const id of chunk) {
      callAgg.set(id, {
        total_call_attempts: 0,
        total_callbacks: 0,
        total_voicemails: 0,
        has_bad_phone: false,
        first_contact_date: null,
        first_callback_date: null,
        first_quote_date: null,
        first_daily_call_date: null,
        latest_call_date: null,
        latest_status: null,
        latest_vendor: null,
      });
    }
    for (const ev of events ?? []) {
      const a = callAgg.get(ev.lead_id);
      if (!a) continue;
      a.total_call_attempts++;
      if (ev.is_callback) a.total_callbacks++;
      if (ev.is_voicemail) a.total_voicemails++;
      if (ev.is_bad_phone) a.has_bad_phone = true;
      if (ev.call_date) {
        if (ev.is_contact && (!a.first_contact_date || ev.call_date < a.first_contact_date)) a.first_contact_date = ev.call_date;
        if (ev.is_callback && (!a.first_callback_date || ev.call_date < a.first_callback_date)) a.first_callback_date = ev.call_date;
        if (ev.is_quote && (!a.first_quote_date || ev.call_date < a.first_quote_date)) a.first_quote_date = ev.call_date;
        if (!a.first_daily_call_date || ev.call_date < a.first_daily_call_date) a.first_daily_call_date = ev.call_date;
        if (!a.latest_call_date || ev.call_date > a.latest_call_date) {
          a.latest_call_date = ev.call_date;
          a.latest_status = ev.current_status ?? a.latest_status;
          a.latest_vendor = ev.vendor_name ?? a.latest_vendor;
        }
      }
    }

    type SalesAgg = {
      first_sold_date: string | null;
      total_items_sold: number;
      total_policies_sold: number;
      total_premium: number;
    };
    const salesAgg = new Map<string, SalesAgg>();
    for (const id of chunk) {
      salesAgg.set(id, { first_sold_date: null, total_items_sold: 0, total_policies_sold: 0, total_premium: 0 });
    }
    for (const ev of sales ?? []) {
      const s = salesAgg.get(ev.lead_id);
      if (!s) continue;
      s.total_items_sold += ev.items ?? 0;
      s.total_policies_sold += 1;
      s.total_premium += Number(ev.premium) || 0;
      if (ev.sale_date && (!s.first_sold_date || ev.sale_date < s.first_sold_date)) {
        s.first_sold_date = ev.sale_date;
      }
    }

    for (const id of chunk) {
      const a = callAgg.get(id)!;
      const s = salesAgg.get(id)!;
      const updates: Record<string, unknown> = {
        total_call_attempts: a.total_call_attempts,
        total_callbacks: a.total_callbacks,
        total_voicemails: a.total_voicemails,
        has_bad_phone: a.has_bad_phone,
        first_contact_date: a.first_contact_date,
        first_callback_date: a.first_callback_date,
        first_quote_date: a.first_quote_date,
        first_daily_call_date: a.first_daily_call_date,
        latest_call_date: a.latest_call_date,
        first_sold_date: s.first_sold_date,
        total_items_sold: s.total_items_sold,
        total_policies_sold: s.total_policies_sold,
        total_premium: s.total_premium,
      };
      if (a.latest_status) updates.current_status = a.latest_status;
      if (a.latest_vendor) updates.latest_vendor_name = a.latest_vendor;
      const { error } = await supabase.from('leads').update(updates).eq('id', id);
      if (error) throw new Error(`Failed to recalc lead ${id}: ${error.message}`);
    }
  }
}

/**
 * Delete leads from the candidate set that no longer have any associated
 * activity (call_events, sales_events, lead_staff_history) and were not
 * created by a Ricochet upload. Run AFTER the upload(s) have been deleted
 * so the FK CASCADE has already removed the dependent rows.
 */
async function deleteOrphanedAutoCreatedLeads(candidateIds: string[]): Promise<{ deletedIds: string[] }> {
  if (candidateIds.length === 0) return { deletedIds: [] };
  const CHUNK = 500;

  // Filter to non-Ricochet leads only — Ricochet leads stay on Ricochet
  // upload delete (FK is SET NULL, not CASCADE).
  const eligible: string[] = [];
  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const chunk = candidateIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .in('id', chunk)
      .is('ricochet_source_upload_id', null);
    if (error) throw new Error('Failed to filter leads for cleanup: ' + error.message);
    for (const row of data ?? []) eligible.push(row.id);
  }
  if (eligible.length === 0) return { deletedIds: [] };

  // Find leads that still have any remaining activity — keep them.
  const stillReferenced = new Set<string>();
  for (let i = 0; i < eligible.length; i += CHUNK) {
    const chunk = eligible.slice(i, i + CHUNK);

    const { data: calls, error: callErr } = await supabase
      .from('call_events')
      .select('lead_id')
      .in('lead_id', chunk);
    if (callErr) throw new Error('Failed to count call_events for cleanup: ' + callErr.message);
    for (const r of calls ?? []) if (r.lead_id) stillReferenced.add(r.lead_id);

    const { data: sales, error: salesErr } = await supabase
      .from('sales_events')
      .select('lead_id')
      .in('lead_id', chunk);
    if (salesErr) throw new Error('Failed to count sales_events for cleanup: ' + salesErr.message);
    for (const r of sales ?? []) if (r.lead_id) stillReferenced.add(r.lead_id);

    const { data: hist, error: histErr } = await supabase
      .from('lead_staff_history')
      .select('lead_id')
      .in('lead_id', chunk);
    if (histErr) throw new Error('Failed to count lead_staff_history for cleanup: ' + histErr.message);
    for (const r of hist ?? []) if (r.lead_id) stillReferenced.add(r.lead_id);
  }

  const toDelete = eligible.filter((id) => !stillReferenced.has(id));
  if (toDelete.length === 0) return { deletedIds: [] };

  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    const { error } = await supabase.from('leads').delete().in('id', chunk);
    if (error) throw new Error('Failed to delete orphaned leads: ' + error.message);
  }
  return { deletedIds: toDelete };
}

export async function deleteUpload(uploadId: string): Promise<void> {
  // Capture lead candidates BEFORE delete so we can check them after the
  // cascade removes call_events / lead_staff_history rows.
  const candidateLeadIds = await collectCandidateLeadIds([uploadId]);
  // Clean up sales_events and auto-created sales leads first
  await deleteSalesLogData([uploadId]);
  const { error } = await supabase.from('uploads').delete().eq('id', uploadId);
  if (error) throw new Error('Failed to delete upload: ' + error.message);
  // Drop any auto-created Daily Call / Deer Dama leads now left orphaned
  const { deletedIds } = await deleteOrphanedAutoCreatedLeads(candidateLeadIds);
  // Recompute denormalized aggregates on surviving leads so dashboards don't
  // read stale counters left over from the deleted upload.
  const deletedSet = new Set(deletedIds);
  await recalcLeadAggregates(candidateLeadIds.filter((id) => !deletedSet.has(id)));
}

/**
 * Delete both uploads in a batch in one query. Used by the Upload Center
 * trash button and by importBatch's rollback path.
 */
/**
 * Find uploads stuck in `processing` status (older than `olderThanMinutes`)
 * for the given agency and clean them up via the standard delete paths so
 * orphaned auto-created leads, sales_events, etc. also get removed. Returns
 * a count of upload rows cleared.
 *
 * 5-minute default avoids clearing an in-flight upload from another tab —
 * typical imports finish in seconds, so anything older is reliably stuck.
 */
export async function clearStuckUploads(
  agencyId: string,
  olderThanMinutes = 5,
): Promise<{ uploadsCleared: number; batchesCleared: number; errors: string[] }> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const errors: string[] = [];

  const { data: stuck, error: stuckErr } = await supabase
    .from('uploads')
    .select('id, batch_id')
    .eq('agency_id', agencyId)
    .eq('status', 'processing')
    .lt('created_at', cutoff);
  if (stuckErr) {
    throw new Error('Failed to read stuck uploads: ' + stuckErr.message);
  }

  const rows = stuck ?? [];
  if (rows.length === 0) return { uploadsCleared: 0, batchesCleared: 0, errors: [] };

  const batchIds = new Set<string>();
  const singletonIds: string[] = [];
  for (const r of rows) {
    if (r.batch_id) batchIds.add(r.batch_id);
    else singletonIds.push(r.id);
  }

  let uploadsCleared = 0;
  let batchesCleared = 0;

  for (const batchId of batchIds) {
    try {
      // Count uploads in this batch (including any siblings) before deleting
      // so the reported number matches what was actually removed.
      const { count } = await supabase
        .from('uploads')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchId);
      await deleteBatch(batchId);
      batchesCleared++;
      uploadsCleared += count ?? 0;
    } catch (e) {
      errors.push(`Batch ${batchId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const uploadId of singletonIds) {
    try {
      await deleteUpload(uploadId);
      uploadsCleared++;
    } catch (e) {
      errors.push(`Upload ${uploadId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { uploadsCleared, batchesCleared, errors };
}

export async function deleteBatch(batchId: string): Promise<void> {
  // Find all upload IDs in this batch first for sales cleanup
  const { data: batchUploads } = await supabase
    .from('uploads')
    .select('id')
    .eq('batch_id', batchId);
  const uploadIds = (batchUploads ?? []).map((u: { id: string }) => u.id);
  // Capture lead candidates BEFORE delete so we can check them after cascade.
  const candidateLeadIds = await collectCandidateLeadIds(uploadIds);
  await deleteSalesLogData(uploadIds);

  const { error } = await supabase.from('uploads').delete().eq('batch_id', batchId);
  if (error) throw new Error('Failed to delete upload batch: ' + error.message);
  // Drop any auto-created Daily Call / Deer Dama leads now left orphaned
  const { deletedIds } = await deleteOrphanedAutoCreatedLeads(candidateLeadIds);
  // Recompute denormalized aggregates on surviving leads so dashboards don't
  // read stale counters left over from the deleted batch.
  const deletedSet = new Set(deletedIds);
  await recalcLeadAggregates(candidateLeadIds.filter((id) => !deletedSet.has(id)));
}
