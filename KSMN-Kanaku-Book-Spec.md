# KSMN Kanaku-Book — Build Spec

A standalone credit/udhaar ledger app for KSM Nataraja Nadar Firm, replacing the paper RN book + duplicate accounting entry workflow.

## Stack
- React + Vite + TypeScript
- Supabase (new, separate project — not shared with SiteFlow)
- Firebase Hosting for deployment
- Supabase Storage for entry photos

---

## 1. Roles & Login

Two PIN-based roles, individual PINs per staff member:

- **Staff**
  - Can add new customers
  - Can add credit entries (detailed or quick mode)
  - Can view the customer search/grid and a customer's entry list
  - Cannot see balances, totals, overdue amounts, dashboard stats, or payments
  - Cannot edit/delete entries
- **Admin**
  - Full access: dashboard, all stats, total outstanding, overdue tracking
  - Record payments, allocate them against specific entries
  - Edit/delete entries and customers
  - Manage staff PINs

Enforcement: role stored as a custom claim / staff table lookup, enforced via Supabase RLS (same pattern used in SiteFlow for rep/admin profit-hiding) — not just hidden in the UI. Staff-facing customer list uses a Postgres view that excludes balance/overdue columns so the numbers are never sent to the client at all, not just hidden by CSS.

---

## 2. Data Model

### `staff`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | |
| pin_hash | text | hashed PIN |
| role | text | 'admin' \| 'staff' |
| active | boolean | default true |
| created_at | timestamptz | |

### `customers`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| customer_code | text unique | e.g. `KSMN-0001`, sequential shop-wide, auto-generated |
| name | text | |
| phone | text | |
| address | text | optional |
| customer_type | text | 'walk-in' \| 'regular' |
| notes | text | optional |
| last_entry_seq | int | default 0 — internal counter for generating entry codes under this customer |
| created_by | uuid fk staff | |
| created_at | timestamptz | |

### `credit_entries`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| entry_code | text unique | e.g. `KSMN-0001-1`, sequential per customer |
| customer_id | uuid fk | |
| entry_mode | text | 'detailed' \| 'quick' |
| description | text | used in quick mode |
| total_amount | numeric | auto-summed from line items in detailed mode, entered directly in quick mode |
| paid_amount | numeric | default 0, updated via payment allocations |
| balance | numeric | generated column: total_amount − paid_amount |
| status | text | 'unpaid' \| 'partial' \| 'paid' — derived from balance |
| photo_url | text | optional, Supabase Storage path |
| created_by | uuid fk staff | |
| created_at | timestamptz | |

### `credit_entry_items` (only populated for detailed mode)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| credit_entry_id | uuid fk | |
| item_name | text | |
| qty | numeric | |
| rate | numeric | |
| amount | numeric | qty × rate |

### `payments`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| customer_id | uuid fk | |
| amount | numeric | total payment received |
| payment_date | date | |
| notes | text | optional |
| created_by | uuid fk staff (must be admin) | |
| created_at | timestamptz | |

### `payment_allocations`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| payment_id | uuid fk | |
| credit_entry_id | uuid fk | |
| allocated_amount | numeric | portion of the payment applied to this entry |

---

## 3. Code Generation Logic

- **Customer code**: `KSMN-0001`, `KSMN-0002`... — one sequence, shop-wide, never reused. Generate via a Postgres sequence or a locked "next value" function to avoid collisions if two staff add customers simultaneously.
- **Entry code**: `KSMN-0001-1`, `KSMN-0001-2`... — increments `customers.last_entry_seq` for that specific customer each time a new entry is created under them. Use a transaction (increment + insert) to avoid race conditions.

---

## 4. Screens

1. **PIN Login** — same pattern as SiteFlow.
2. **Quick Add Credit** (staff + admin)
   - Search or create customer (live search by name/phone/customer code)
   - Toggle: Detailed / Quick mode
     - Detailed: add line items (item, qty, rate) → auto-total
     - Quick: single description + total amount
   - Photo capture/upload (camera or file)
   - Save → generates entry code, shows confirmation
3. **Customer Search / Grid** (staff sees limited view, admin sees full)
   - Search by name, phone, or customer code
   - Staff view: name, phone, type, entry list (no amounts/balance)
   - Admin view: adds running balance, last transaction date, overdue flag
4. **Customer Detail** (admin only for balances; staff can view entries list without amounts)
   - Full entry history with codes, dates, amounts, status
   - "Payment Received" button (admin only)
5. **Payment Received** (admin only)
   - Enter amount received
   - System pre-checks oldest unpaid entries up to the amount (FIFO suggestion)
   - Admin can uncheck/recheck to manually reallocate across entries
   - Save → updates paid_amount/balance/status on each affected entry
6. **Admin Dashboard**
   - Total outstanding across the business
   - Top debtors, overdue list
   - Recent activity feed
   - Staff management (add/deactivate staff, reset PINs)

---

## 5. Open items to decide later (not blockers)
- Whether to add a WhatsApp-style "share statement" text export per customer
- Migration plan for old paper RN records (once this is validated, map each paper entry to the right customer and backfill as `-1`, `-2`, etc.)

---

## Cline Prompt (paste this into Cline to scaffold the project)

```
Build a new web app called "KSMN Kanaku-Book" — a credit/udhaar ledger tracker for a building materials retail shop (KSM Nataraja Nadar Firm).

STACK: React + Vite + TypeScript + Supabase (new project, provide setup instructions/SQL separately) + Firebase Hosting. Use Tailwind CSS for styling. No offline support needed — assume reliable internet.

ROLES: PIN-based login, two roles — "admin" and "staff", individual PIN per staff member (a `staff` table with hashed PINs, not shared logins). Staff can only add customers and credit entries, and view a limited customer/entry list with NO amounts, balances, or totals visible. Admin has full access to dashboards, balances, overdue tracking, and payments. Enforce this at the Supabase RLS level (not just hidden in the UI) — staff role should query a restricted view that excludes balance/financial columns entirely.

DATA MODEL:
- customers: id, customer_code (auto-generated sequential shop-wide, format KSMN-0001), name, phone, address (optional), customer_type ('walk-in' | 'regular'), notes, last_entry_seq (int, default 0), created_by, created_at
- credit_entries: id, entry_code (auto-generated per-customer, format KSMN-0001-1, KSMN-0001-2...), customer_id, entry_mode ('detailed' | 'quick'), description (for quick mode), total_amount, paid_amount (default 0), balance (generated: total_amount - paid_amount), status ('unpaid'|'partial'|'paid', derived from balance), photo_url (optional), created_by, created_at
- credit_entry_items: id, credit_entry_id, item_name, qty, rate, amount (only used when entry_mode = 'detailed')
- payments: id, customer_id, amount, payment_date, notes, created_by (must be admin), created_at
- payment_allocations: id, payment_id, credit_entry_id, allocated_amount
- staff: id, name, pin_hash, role ('admin'|'staff'), active, created_at

CODE GENERATION:
- customer_code must be a shop-wide sequential counter (KSMN-0001, KSMN-0002...), generated safely under concurrent inserts (use a Postgres sequence or a locking function).
- entry_code increments a per-customer counter (customers.last_entry_seq) so each customer's entries are numbered KSMN-000X-1, KSMN-000X-2, etc. Must be safe under concurrent inserts (wrap increment + insert in a transaction).

SCREENS:
1. PIN Login (role-aware — admin vs staff routing after login)
2. Quick Add Credit: search/create customer (live search by name, phone, or customer_code), toggle between "Detailed" (multi line-item entry with item/qty/rate, auto-totaled) and "Quick" (single description + total amount) modes, photo upload/capture attached to the entry, auto-generates entry_code on save.
3. Customer Search/Grid: staff view shows name, phone, type, and entry list only (no financial data); admin view additionally shows running balance, last transaction date, and an overdue indicator.
4. Customer Detail: full entry history (entry_code, date, amount, status); "Payment Received" button visible to admin only.
5. Payment Received (admin only): enter amount, system pre-checks oldest unpaid/partial entries first (FIFO) up to the payment amount as a starting suggestion, but admin can manually check/uncheck any entries to reallocate the payment across them; on save, updates paid_amount/balance/status on each selected entry accordingly.
6. Admin Dashboard: total outstanding across all customers, top debtors list, overdue entries list, recent activity feed, and staff management (add/deactivate staff members, reset PINs).

Please scaffold the project structure, Supabase schema (as SQL migration files including RLS policies for the staff/admin split described above), and the core pages listed above. Ask me before making assumptions on visual styling — keep it simple and functional to start.

### Edge Function Configuration Rule

All edge functions must use custom JWT tokens (`APP_JWT_SECRET`), not Supabase Auth. Therefore, every new edge function requires a matching config block in `supabase/config.toml`:

```toml
[functions.<function-name>]
verify_jwt = false
```

This is a mandatory step — missing this block causes 401 errors at the platform gateway before the function's internal `verifyToken()` can run. This has caused recurring deployment bugs (verify-pin, the original batch of 9, get-settings/update-settings/update-customer, ai-scan) whenever new functions were added.
```
