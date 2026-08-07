# KSMN Kanaku-Book

A credit/udhaar ledger tracker for KSM Nataraja Nadar Firm - building materials retail shop.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Auth**: Custom PIN-based authentication with JWT
- **Hosting**: Firebase Hosting

## Project Structure

```
KSMN Kanakku-book/
├── supabase/
│   ├── migrations/
│   │   └── 001_schema.sql          # Database schema, RLS policies, functions
│   └── functions/
│       └── verify-pin/
│           └── index.ts             # Edge function for PIN verification
├── src/
│   ├── components/
│   │   ├── ui/                      # Reusable UI components
│   │   └── layout/                  # Layout components
│   ├── context/
│   │   └── AuthContext.tsx          # Authentication context
│   ├── lib/
│   │   ├── supabase.ts              # Supabase client & auth helpers
│   │   └── utils.ts                 # Utility functions
│   ├── pages/                       # Page components
│   ├── types/
│   │   └── index.ts                 # TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── public/
│   └── KSMN_logo.png                # Company logo
├── firebase.json                    # Firebase Hosting config
├── .firebaserc                      # Firebase project config
├── .env.example                     # Environment variables template
└── package.json
```

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API to get your:
   - Project URL
   - Anon/Public Key
3. Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Run the database migration:
   - Go to Supabase Dashboard → SQL Editor
   - Copy and paste the contents of `supabase/migrations/001_schema.sql`
   - Execute the SQL

### 3. Set Up Supabase Edge Functions

1. Install Supabase CLI: `npm install -g supabase`
2. Link your project: `supabase link --project-ref your-project-id`
3. Set required secrets:
   ```bash
   supabase secrets set APP_JWT_SECRET=your-jwt-secret-key-here
   ```
4. Deploy all edge functions:
   ```bash
   supabase functions deploy
   ```

**Note:** These functions use their own JWT tokens via `APP_JWT_SECRET` (not Supabase Auth), so the `verify_jwt = false` config blocks must be present in `supabase/config.toml`. See the mandatory step below.

#### ⚠️ Mandatory Step When Adding New Edge Functions

Every new edge function **must** have a matching config block in `supabase/config.toml`:

```toml
[functions.<function-name>]
verify_jwt = false
```

This is required because all edge functions in this project use custom `APP_JWT_SECRET` tokens (verified internally via `_shared/jwt-utils.ts`), not Supabase Auth. Without this block, Supabase's platform gateway will reject requests with 401 before the function code even runs.

**Checklist when creating a new function:**
- [ ] Create the function directory under `supabase/functions/<name>/`
- [ ] Add the `[functions.<name>]` block with `verify_jwt = false` to `supabase/config.toml`
- [ ] Deploy the function: `supabase functions deploy <name>`
- [ ] Verify it appears in `supabase functions list` with `ACTIVE` status

### 4. Set Up Firebase Hosting

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize project (if not already done):
   ```bash
   firebase init hosting
   ```
4. Update `.firebaserc` with your Firebase project ID
5. Build and deploy:
   ```bash
   npm run deploy
   ```

### 5. Create First Admin User

After running the migration, a default admin user is created with a placeholder PIN. You need to set the PIN:

**Option 1: Via Supabase SQL Editor**
```sql
-- Hash the PIN "admin123" (use bcrypt to generate hash)
UPDATE staff 
SET pin_hash = '$2a$10$your-bcrypt-hash-here'
WHERE name = 'Admin';
```

**Option 2: Via the app (after setting up edge function)**
- The edge function will handle PIN verification
- You can create additional staff members via the Staff Management page

**Option 2: Via the app (after setting up edge function)**
- The edge function will handle PIN verification
- You can create additional staff members via the Staff Management page

### 6. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see the app.

## Features

### Role-Based Access

**Staff:**
- Add new customers
- Add credit entries (detailed or quick mode)
- View customer list (no financial data)
- View entry list (no amounts/balances)

**Admin:**
- Full dashboard with statistics
- View balances, totals, and overdue entries
- Record payments and allocate to entries
- Manage staff members (add/deactivate/reset PINs)
- All staff permissions

### Screens

1. **Login** - PIN-based authentication
2. **Dashboard** (Admin) - Total outstanding, top debtors, overdue entries, recent activity
3. **Add Credit** - Create new credit entries with detailed/quick modes
4. **Customers** - Search and view customer list
5. **Customer Detail** - View customer info and entry history
6. **Record Payment** (Admin) - Allocate payments to entries with FIFO auto-suggestion
7. **Staff Management** (Admin) - Add/deactivate staff, reset PINs

### Data Model

- **Customers**: Sequential customer codes (KSMN-0001, KSMN-0002...)
- **Credit Entries**: Per-customer sequential entry codes (KSMN-0001-1, KSMN-0001-2...)
- **Payments**: Record payments with allocation to specific entries
- **Staff**: Individual PINs with role-based access

### Security

- PIN hashing with bcrypt (10 rounds)
- JWT-based sessions (24h expiry)
- All data access goes through edge functions (no direct Postgres access from frontend)
- Role-based authorization enforced in edge functions
- Staff view excludes financial columns at database level
- Server-side PIN verification via Edge Function

## Configuration

### Overdue Thresholds

Default overdue periods (configurable via app_settings table):
- Walk-in customers: 30 days
- Regular customers: 45 days

Admin can modify these values in the database.

## Development

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Deploy to Firebase

```bash
npm run deploy
```

## Notes

- All monetary values are stored as NUMERIC(12,2) in the database
- Customer codes are generated using a Postgres sequence (thread-safe)
- Entry codes use row-level locking to prevent race conditions
- Photo uploads use Supabase Storage (bucket: `entry-photos`)
- No offline support - assumes reliable internet connection

## Support

For issues or questions, contact the development team.