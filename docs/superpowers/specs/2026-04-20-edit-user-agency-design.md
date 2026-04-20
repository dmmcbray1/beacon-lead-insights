# Edit User Agency — Design

**Date:** 2026-04-20
**Status:** Approved, ready for implementation plan
**Author:** Claude (brainstormed with @dmmcbray1)

## Problem

Admins can assign an agency to a user only at initial approval. Once a user is in the Approved list, there is no UI to set or change their `agency_id`. This stranded at least one user (david@beaconterritory.com) as "approved with no agency," filtering their data views to nothing.

## Scope

Add an inline "change agency" control to each row in the **Approved Users** table in `src/pages/UserManagement.tsx`. Admins can set or change any approved user's `agency_id` — including their own. No other fields editable. Page remains admin-only via the existing `AdminRoute` wrapper.

Out of scope: editing approval status, admin role, email, or any other `user_profiles` field from this row.

## Current State

- `user_profiles` has `agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL` (migration `20260322220909`).
- RLS policy **"Admins can update all profiles"** already permits the update — no schema or policy work needed.
- `UserManagement.tsx` already loads agencies into component state and uses a native `<select>` + button pattern for the Rejected row (lines 247–258) and Pending row (PendingUserCard, ~lines 275+). The new control matches that pattern.

## UI

In the Approved table's "Actions" cell, add:

- A native `<select>` populated from the existing `agencies` state. Includes an "— No agency —" option (value `""`, representing `null`) as the first entry. Pre-selected to the user's current `agency_id`, or the empty option if the user has no agency.
- A small **Save** button, disabled unless the selection differs from the current value. Submitting the empty option sends `agency_id: null` to Supabase (revoking the assignment).

The Agency column keeps showing the current value until the save round-trip completes and `loadData()` refreshes the list.

## Data Flow

New handler:

```
updateAgency(profile, agencyId):
  supabase
    .from('user_profiles')
    .update({ agency_id: agencyId })
    .eq('user_id', profile.user_id)
  on success → toast.success(`Updated agency for ${profile.email}`) + loadData()
  on failure → toast.error(`Failed to update agency: ${error.message}`)
```

No optimistic update; the Save button shows a pending state (disabled) during the await, then `loadData()` re-fetches.

## Edge Cases

- **User with no agency yet:** select starts empty; Save enables when a real agency is chosen.
- **Changing own agency:** allowed. Admin role bypasses agency-scoped RLS (per `is_admin` checks in migration `20260322220909`), so there is no self-lockout. No extra confirm prompt.
- **No agencies exist in the system:** select renders empty; Save stays disabled. Matches existing Pending/Rejected behavior.
- **Network / RLS failure:** Supabase error surfaced via toast; UI does not change until success.

## Testing

Manual verification (repo has only a placeholder Vitest test):

- Change agency for an approved user → UI reflects new agency after refresh.
- Change own agency as admin → still have admin access; non-admin views filter to the new agency.
- Attempt save with unchanged selection → button stays disabled.
- Approved user with no agency → can assign one from the dropdown.
- Revoke a user's agency by picking the empty option → `agency_id` becomes `null` and row shows "No agency."

## Files Touched

- `src/pages/UserManagement.tsx` — add `updateAgency` handler and inline select/Save in the approved-users table row.

No migrations, no new dependencies, no new files.
