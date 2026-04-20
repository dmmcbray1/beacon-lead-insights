# Beacon Lead Insights — Project Handoff

**Date:** March 24, 2026
**Project path:** `C:\Users\david\beacon-lead-insights`
**Supabase project ID:** `vnaybjjvzdsrbcikfpmt`
**Live URL:** `https://vnaybjjvzdsrbcikfpmt.supabase.co` (backend)

---

## What This System Does

A web dashboard for analyzing insurance lead and call performance from Ricochet360. It accepts two types of CSV exports from Ricochet, stores them permanently in a Supabase database, and displays key performance metrics filtered to **Beacon Territory** leads only.

### Key Metrics Tracked
| Metric | Description |
|--------|-------------|
| **Total Leads** | Count of all Beacon Territory leads |
| **Contact Rate** | % of leads where someone answered the phone |
| **Quote Rate** | % of contacts that converted to a quote |
| **Avg Days to Sell** | Days from first seen to sold (first_seen_date → first_sold_date) |
| **Bad Phone Rate** | % of leads with a disconnected / wrong number |
| **Contact Timing** | Distribution of when first contact was made: Day 0, Day 1, Day 2–7, Day 8–31, 31+, Never |
| **New vs Re-Quote** | Side-by-side comparison of all metrics for each lead type |
| **Staff Performance** | All metrics broken down per agent |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui components |
| Charts | Recharts |
| State / Data | TanStack Query v5 |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) |
| CSV parsing | `xlsx` library (client-side, runs in browser) |

---

## Project Structure

```
beacon-lead-insights/
├── src/
│   ├── pages/
│   │   ├── Index.tsx            ← Main dashboard (KPIs, contact timing, new vs re-quote)
│   │   ├── StaffPerformance.tsx ← Per-agent metrics table + bar chart
│   │   ├── LeadExplorer.tsx     ← Searchable lead list
│   │   ├── UploadCenter.tsx     ← CSV upload with progress + history
│   │   ├── AgencyPerformance.tsx← Multi-agency comparison (admin only)
│   │   ├── Admin.tsx            ← Admin panel
│   │   ├── UserManagement.tsx   ← Approve/manage users (admin only)
│   │   ├── Login.tsx
│   │   └── ResetPassword.tsx
│   ├── hooks/
│   │   ├── useLeadData.ts       ← ALL data hooks (replaces seed data)
│   │   └── useAuth.tsx          ← Auth context
│   ├── lib/
│   │   ├── importService.ts     ← CSV parsing + Supabase import pipeline
│   │   ├── metrics.ts           ← KPI calculation logic (calculateKPIs)
│   │   ├── constants.ts         ← Status lists, vendor filter rules, column names
│   │   └── phone.ts             ← Phone normalization (strips to 10 digits)
│   └── components/
│       ├── FilterBar.tsx        ← Date range, staff, lead type, vendor filter controls
│       ├── FlipKPICard.tsx      ← Flip card showing overall + new/re-quote breakdown
│       └── AppSidebar.tsx       ← Navigation
├── supabase/
│   ├── config.toml              ← project_id = vnaybjjvzdsrbcikfpmt
│   └── migrations/
│       ├── (earlier migrations) ← Schema creation, RLS policies
│       └── 20260324000000_allow_customer_import.sql  ← ⚠️ MUST BE APPLIED (see below)
├── DailyCallLogExample2.csv     ← Sample Daily Call Report
├── DeerDamaExample2.csv         ← Sample Deer Dama (Lead) Report
└── .env                         ← Supabase URL + anon key
```

---

## The Two CSV Report Types

### 1. Daily Call Report (`DailyCallLogExample2.csv`)
One row per call. Exported from Ricochet's call log.

| Column | Used For |
|--------|----------|
| `Date` | Call date, used to populate first_seen / first_contact dates |
| `User` | Staff member name → matched to staff_members table |
| `From` / `To` | Lead phone (From = inbound, To = outbound) |
| `Call Type` | **Vendor filter** — must contain "Beacon Territory" for outbound new leads |
| `Current Status` | Classifies call as: Contact / Quote / Sold / Bad Phone / Re-Quote |
| `Call Status` | Call completion status |
| `Vendor Name` | Secondary vendor tag |

### 2. Deer Dama / Lead Report (`DeerDamaExample2.csv`)
One row per lead. Exported from Ricochet's lead database.

| Column | Used For |
|--------|----------|
| `Lead ID` | External ID, used for lead matching (preferred over phone) |
| `Lead Status` | Current status — drives contact/quote/sold/bad-phone classification |
| `Lead Owner` | Staff member name |
| `Created At` | Lead creation date = first_seen_date |
| `Vendor` | Lead source vendor name |
| `First Call Date` | Approximate first contact date |
| `Last Call Date` | Latest call date |
| `Total Calls` | Used for calls_at_first_quote / calls_at_first_sold |
| `Phone - Main` | Lead phone number |

---

## Status Classification System

Ricochet uses a numbered status scheme. These are defined in `src/lib/constants.ts`:

| Category | Statuses |
|----------|---------|
| **Contact** | `2.0 CONTACTED - Follow Up`, `2.1 CONTACTED - Not Interested`, `2.2`, `2.4`, `3.0–3.3 QUOTED`, `4.0 SOLD` |
| **Quote** | `3.0 QUOTED`, `3.1 QUOTED - HOT!!!!`, `3.2 QUOTED - Not Interested`, `3.3 XDATE- Task Set`, `4.0 SOLD` |
| **Sold** | `4.0 SOLD` |
| **Bad Phone** | `1.1 CALLED BAD PHONE #`, `1.2 CALLED - Bad Phone #` |
| **Re-Quote** | `9.1 REQUOTE` |

To add new status values (e.g. if Ricochet adds new dispositions), edit the arrays in `src/lib/constants.ts`.

---

## Beacon Territory Vendor Filter

"Beacon Territory" does **not** appear in the `Vendor Name` column — it appears inside the `Call Type` column as part of a campaign description string (e.g. `"9.5h: New Home to Beacon Territory : List Upload - Priority List Only Day 14-21"`).

**Filter logic applied during Daily Call import:**

```
Row passes filter if:
  - Current Status = "9.1 REQUOTE"  →  Call Type OR Vendor Name contains "requote"
  - Call Type = "Inbound Call" or "Inbound IVR"  →  always passes (inbound calls)
  - All other rows  →  Call Type must contain "beacon territory"
```

Rows that don't pass are counted as "filtered" in the import summary but not saved to the database.

The vendor filter toggle on the Dashboard applies a secondary client-side filter after data is loaded, controlled by `latest_vendor_name` stored on each lead.

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `leads` | One row per unique lead (by phone + agency). Master record. |
| `call_events` | One row per call. Linked to leads. Drives staff performance. |
| `staff_members` | Agent names, linked to agency. Auto-created on first import. |
| `agencies` | Agency records. Admins can see all; customers see their own. |
| `uploads` | Import history — one row per file uploaded. |
| `raw_daily_call_rows` | Raw CSV rows from Daily Call imports (for audit / reprocessing). |
| `raw_deer_dama_rows` | Raw CSV rows from Deer Dama imports. |
| `user_profiles` | User → agency assignment + approval status. |
| `user_roles` | Admin vs customer role. |

**Key fields on `leads`:**

| Field | Description |
|-------|-------------|
| `normalized_phone` | 10-digit US phone, no punctuation |
| `current_lead_type` | `new_lead` or `re_quote` |
| `current_status` | Latest Ricochet status string |
| `first_seen_date` | When lead was first received |
| `first_contact_date` | First successful contact |
| `first_quote_date` | First quote |
| `first_sold_date` | Date sold |
| `total_call_attempts` | Total calls made |
| `total_callbacks` | Total inbound callbacks |
| `has_bad_phone` | True if any call hit bad phone status |
| `latest_vendor_name` | Vendor hint used for Beacon Territory filter |
| `calls_at_first_quote` | Call count snapshot when lead was first quoted |

---

## ⚠️ Required One-Time Setup: Apply the Database Migration

The most recent migration (`20260324000000_allow_customer_import.sql`) **has not been applied to Supabase yet.** Without it, CSV imports will fail with permission errors because the database only allows admins to insert leads.

**Steps:**
1. Go to [supabase.com](https://supabase.com) → sign in → open project `vnaybjjvzdsrbcikfpmt`
2. Click **SQL Editor** in the left sidebar
3. Open `supabase/migrations/20260324000000_allow_customer_import.sql` from this project
4. Paste the entire contents into the SQL editor and click **Run**

This adds INSERT/UPDATE permissions on `leads`, `call_events`, `staff_members`, and `lead_staff_history` for approved customer accounts.

---

## Running the App Locally

```bash
cd C:\Users\david\beacon-lead-insights

# Install dependencies (first time only)
npm install

# Start dev server
npm run dev
```

Then open `http://localhost:5173` in your browser.

---

## User Roles & Access

| Role | Access |
|------|--------|
| **Admin** | Full access to all agencies, all data, user management |
| **Customer** | Can only see their own agency's data, can upload files |

New users who sign up land in `pending` status. An admin must approve them in **User Management** and assign them to an agency before they can log in and use the app.

---

## How to Upload Data

1. Log in → go to **Upload Center**
2. Set the upload date and optionally add a note (e.g. "Mar 24 morning batch")
3. Drop a CSV file or click **Browse Files**
4. The system auto-detects whether it's a Daily Call Report or Deer Dama report
5. Preview the first 5 rows, confirm the type, click **Import File**
6. A progress bar shows phases: parsing → filtering → creating leads → saving call events
7. The summary screen shows: total rows, rows imported, rows filtered (non-Beacon Territory), new leads created, existing leads updated

**Important:** Don't import the same file twice — there is no duplicate call-event detection, so counts will double. The Upload History table shows what's already been imported.

---

## Dashboard Filters

| Filter | Options |
|--------|---------|
| **Date Range** | Today / Last 7 Days / Last 30 Days / Last 90 Days / Year to Date / All Time |
| **Date Basis** | Lead Created / Call Date / First Contact / First Quote / Callback Date |
| **Staff** | All Staff or a specific agent (populated from your imported agents) |
| **Lead Type** | All / New Leads / Re-Quotes |
| **Beacon Territory** | Toggle ON/OFF — ON filters to Beacon Territory leads only |

---

## Known Limitations & Future Work

| Item | Notes |
|------|-------|
| **10k lead hard cap** | `useLeads()` in `src/hooks/useLeadData.ts` caps at 10,000 rows. At ~500 leads/week per agency this is roughly 4 years of runway per agency; revisit before it becomes a ceiling. |
| **Row-level failure isolation** | Import errors currently short-circuit the batch — a single malformed row can still fail the whole phase. Consider per-chunk error collection. |

### Known Data Limitations (not fixable in code)

These are constraints of the source system (Ricochet360 CSV exports). Future maintainers should not spend time trying to fix them in the client.

| Limitation | Why it's unfixable | Impact |
|------------|--------------------|--------|
| **`first_sold_date` is approximated** | Ricochet does not export a dedicated sold timestamp in either report type. We approximate it as `First Call Date` when the status is `4.0 SOLD`. | Sold-date analytics are accurate to the day of the first contact, not the day the deal actually closed. If Ricochet later adds a sold-date column, wire it through `importService.ts` and drop the approximation. |

---

## Key Files to Edit for Common Changes

| Change needed | File |
|---------------|------|
| Add a new Ricochet status value | `src/lib/constants.ts` — add to the appropriate array |
| Change the vendor filter keyword | `src/lib/constants.ts` — `VENDOR_FILTER_RULES` |
| Add a new KPI to the dashboard | `src/lib/metrics.ts` (calculation) + `src/pages/Index.tsx` (display) |
| Add a new CSV report type | `src/lib/importService.ts` + `src/lib/constants.ts` |
| Change what "contact" means | `src/lib/constants.ts` — `CONTACT_DISPOSITIONS` |
| Change time buckets for contact timing | `src/hooks/useLeadData.ts` — `TIMING_BUCKETS` array |
