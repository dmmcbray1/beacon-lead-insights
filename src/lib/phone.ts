/**
 * Normalize a phone number by stripping all non-digit characters
 * and removing optional leading country code (1 for US).
 * Returns null if the result is not a valid 10-digit US number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip everything except digits
  let digits = raw.replace(/\D/g, '');
  // Remove leading country code '1' if 11 digits
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.substring(1);
  }
  // Must be 10 digits for a valid US phone
  if (digits.length !== 10) return null;
  return digits;
}

/**
 * Format a normalized 10-digit phone for display: (555) 123-4567
 */
export function formatPhone(normalized: string | null): string {
  if (!normalized || normalized.length !== 10) return normalized || '';
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}
