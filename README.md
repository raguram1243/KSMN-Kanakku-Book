# KSMN Kanaku-Book

A credit/udhaar ledger for KSM Nataraja Nadar Firm, a building-materials shop. It replaces the paper credit book: bills given on credit, payments received, who owes what, and who to chase.

The original build spec is in [`KSMN-Kanaku-Book-Spec.md`](KSMN-Kanaku-Book-Spec.md). This file describes the app as it is now.

## Tech stack

| Part | What |
|---|---|
| Front end | React 18, Vite, TypeScript, Tailwind CSS, React Query, Zustand |
| Back end | Supabase: Postgres plus Deno edge functions in `supabase/functions` |
| Auth | Name + PIN. `verify-pin` issues our own JWT (signed with `APP_JWT_SECRET`), not Supabase Auth |
| Hosting | Firebase Hosting (`dist/`) |
| Files | Supabase Storage (bills, photos, payment proofs) |
| AI Scan | Google Gemini, called from the `ai-scan` edge function |

The browser never talks to Postgres. Every read and write goes through an edge function, which checks the token **and** the staff row on each call (`_shared/auth.ts`). Row-level security is locked down (migrations 002, 025, 032) and SQL helper functions are callable by `service_role` only.

## Project layout

```
src/
  pages/            One file per screen (Dashboard, Customers, QuickAdd, PaymentReceived, ...)
  components/       ui/ (buttons, modals, inputs), layout/, modals/, customer/, dashboard/, ...
  hooks/            useApi.tsx (React Query hooks + cache invalidation), useActionProgress, ...
  lib/              api.ts (all edge-function calls), utils, PDF/CSV/bill/receipt helpers, offlineCache
  context/          AuthContext, ThemeContext
  services/ai/      AI Scan client (invoice / payment extraction)
public/             Icons, manifest, sw.js (offline shell)
supabase/
  migrations/       001 ... 036, applied in order
  functions/        One folder per edge function, plus _shared/
  config.toml       Per-function settings (see "Adding an edge function")
scripts/region-move Notes and SQL used for the Seoul to Mumbai database move
```

## Roles

- **Staff**: add customers, add credit entries (detailed or quick), and send payments. A staff payment is saved as *pending* and counts nowhere until an admin approves it. Staff never see balances or totals. They land on Add Credit Entry.
- **Admin**: everything staff can do, plus the dashboard, customer ledgers, Payment Received (allocate to bills), Approvals, Day-book, Follow-ups, Reports, Staff management and Settings. They land on the Dashboard.

Staff are individual people with their own PIN. Changing a PIN or role signs that person out everywhere.

## Features

- **Customers**: codes `KSMN-0001`, types (walk-in, regular, contractor, wholesale, corporate), credit limit, custom overdue days, advance balance, last reminder.
- **Credit entries**: codes `KSMN-0001-1`, detailed (line items) or quick (one amount), photos and files, Print Bill for detailed entries.
- **Payments**: methods, receipt numbers, proofs, FIFO suggestion with manual allocation, advance (unallocated) balance, idempotency key against double-submits.
- **Approvals**: admin reviews staff payments and approves (with allocation) or rejects.
- **Dashboard**: total outstanding (receivable), customer split, weekly credit vs collection chart, top debtors, top customers this month, aging buckets, alerts.
- **Day-book, Reports, exports**: by day (IST), entries and payments reports, CSV/PDF export, a daily backup CSV pulled by the admin's device.
- **Follow-ups and WhatsApp**: reminders, statements and receipts shared over WhatsApp.
- **AI Scan**: photo or PDF of a bill or payment slip is read into a draft entry or payment, with customer matching.
- **Safety nets**: a possible-duplicate warning when the same customer gets the same bill total within 10 minutes, and when a new customer shares a phone number or a very alike name with an existing one.
- **Offline (read-only)**: the app opens with no network and shows the last loaded data. See below.

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com). Pick the region closest to the shop.
2. Create `.env` in the repo root. The front end needs only the project URL:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   ```

3. Apply **every** file in `supabase/migrations/` in numeric order (SQL Editor, or `supabase db push` after `supabase link`). Newer files assume the older ones.

### 3. Edge function secrets

```bash
supabase link --project-ref your-project-id
supabase secrets set APP_JWT_SECRET=a-long-random-string
supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
```

| Secret | Needed for |
|---|---|
| `APP_JWT_SECRET` | Signing and checking login tokens. Required. |
| `GEMINI_API_KEY` | AI Scan. Get one from [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | Optional. Overrides the default model. If scans fail with "model no longer available", open `<project-url>/functions/v1/ai-scan/health` to see which models your key can use, then set one here and redeploy. |
| `ALLOWED_ORIGINS` | Optional. Comma-separated site origins allowed to call the functions. Defaults to the Firebase site and localhost. Set it if the site gets a custom domain. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to edge functions by Supabase itself.

> **Never** put the Gemini key, the JWT secret or the service-role key in a `VITE_` variable. Vite copies those into the public JavaScript bundle.

### 4. Deploy the edge functions

```bash
supabase functions deploy
```

### 5. First admin

The migration creates an admin row without a usable PIN. Set one in the SQL Editor with a bcrypt hash (10 rounds):

```sql
UPDATE staff SET pin_hash = '$2a$10$your-bcrypt-hash-here' WHERE name = 'Admin';
```

After that, add staff from the Staff page in the app.

### 6. Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
# put your project id in .firebaserc
npm run deploy      # builds, then firebase deploy
```

`firebase.json` sets the security headers, including a Content-Security-Policy that names the Supabase project URL. If you move to a new Supabase project, update that URL there too.

### 7. Run locally

```bash
npm run dev         # http://localhost:5173
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check (`tsc`) and build to `dist/` |
| `npm run lint` | ESLint (warnings are expected; it should report 0 errors) |
| `npm run preview` | Serve the production build locally |
| `npm run deploy` | Build and deploy to Firebase |

There is no automated test suite yet.

## Changing the backend

### Adding a database migration

1. Add `supabase/migrations/NNN_short_name.sql`, the next number in sequence. Never edit a migration that has already been applied; add a new one.
2. If it creates a SQL function that only edge functions should call, finish with the same lockdown the recent ones use:

   ```sql
   REVOKE EXECUTE ON FUNCTION my_fn(...) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION my_fn(...) TO service_role;
   ```

3. Apply it to the live project (SQL Editor or `supabase db push`) **before** deploying code that calls it.

### Adding an edge function

Every function uses our own JWT, so it needs this block in `supabase/config.toml`, otherwise Supabase's gateway rejects every request with 401 before the function runs:

```toml
[functions.<function-name>]
verify_jwt = false
```

Checklist:

- [ ] Create `supabase/functions/<name>/index.ts`. Start with `requireStaff(req, supabase)`, or `requireStaff(req, supabase, 'admin')` for admin-only.
- [ ] Add the `[functions.<name>]` block above. A GitHub Action (`edge-functions-check.yml`) fails the push if it is missing.
- [ ] Add the call to `src/lib/api.ts` (and a React Query hook in `src/hooks/useApi.tsx` if it is a read).
- [ ] `supabase functions deploy <name>`
- [ ] Confirm it shows `ACTIVE` in `supabase functions list`.

Staff responses must never include balances or other financial fields; see `create-entry` and `create-customer` for how they trim the reply by role.

## Offline (read-only) mode

- `public/sw.js` caches the app shell and built JS/CSS, so the app opens with no network.
- `src/lib/offlineCache.ts` saves React Query's cache to the device (up to 24 hours, matching the login). Offline, pages show the last data they loaded, and a banner says so.
- Saving is switched off offline (`apiCall` refuses writes with "You are offline"). Nothing is queued, because balances, codes and approvals are decided on the server.
- A page never opened on this device cannot load offline, since its code is fetched on first visit.
- The saved data is wiped on logout, when a session expires or ends, and when the app opens with no session. Reports are not saved.

## Notes

- Money is `NUMERIC(12,2)`.
- Customer codes come from a Postgres sequence; entry codes use row locking, so both are safe under simultaneous saves.
- "Today" and "this month" are in Asia/Kolkata everywhere.
- Overdue thresholds default to 30 days (walk-in) and 45 days (regular) and are held in `app_settings`; each customer can override their own.
- Region move notes (Seoul to Mumbai) are in `scripts/region-move/README.md`.
