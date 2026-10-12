# Moving the database from Seoul to Mumbai

Option 3: back up Seoul, pause it, build a new project in Mumbai (ap-south-1),
load everything, point the website at it. Seoul is only paused, never changed
(except step 3's freeze), so it is the rollback.

| | Seoul (old) | Mumbai (new) |
|---|---|---|
| Project ref | `rmuyoderuasqbdirhvpq` | filled in at step 6 |
| Session pooler | `aws-1-ap-northeast-2.pooler.supabase.com:5432` | from Dashboard → Connect → Session pooler |
| DB user | `postgres.rmuyoderuasqbdirhvpq` | `postgres.<new ref>` |

All commands run from the repo root in Git Bash. Backups go to `D:\Projects\KSMN-backups\<date>` — outside the repo, never committed.

```bash
PG="/c/Program Files/PostgreSQL/17/bin"
B="/d/Projects/KSMN-backups/2026-10-12"
SEOUL="host=aws-1-ap-northeast-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.rmuyoderuasqbdirhvpq sslmode=require"
```

## During the day (no effect on the shop)

1. **Reset the Seoul DB password** (Dashboard → Project Settings → Database → Reset database password). Safe: the app never uses it.
2. **Owner creates the password file** `%APPDATA%\postgresql\pgpass.conf` (one line per project, `host:port:database:user:password`):
   ```
   aws-1-ap-northeast-2.pooler.supabase.com:5432:postgres:postgres.rmuyoderuasqbdirhvpq:<seoul password>
   ```
   Then test (read-only): `"$PG/psql" "$SEOUL" -X -c "select count(*) from customers"`

## Tonight

### Freeze and back up Seoul (shop is down from here)

3. **Maintenance page and write freeze**
   ```bash
   npx firebase deploy --only hosting --config scripts/region-move/maintenance-site/firebase.json --project ksmn-kanakku-book
   # Any tab still open gets logged out: tokens signed with the old secret stop working on Seoul.
   supabase secrets set --project-ref rmuyoderuasqbdirhvpq APP_JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
   ```
4. **Back up** (full, data-only, schema-only) and **snapshot**
   ```bash
   mkdir -p "$B"
   "$PG/pg_dump" "$SEOUL" -Fc --schema=public --no-owner --no-privileges -f "$B/seoul-public-full.dump"
   "$PG/pg_dump" "$SEOUL" --data-only --schema=public --no-owner --no-privileges --exclude-table=login_throttle -f "$B/seoul-data.sql"
   "$PG/pg_dump" "$SEOUL" --schema-only --schema=public --no-owner --no-privileges -f "$B/seoul-schema.sql"
   "$PG/psql" "$SEOUL" -X -A -t -f scripts/region-move/snapshot.sql > "$B/snapshot-seoul.txt"
   "$PG/pg_restore" --list "$B/seoul-public-full.dump" | tail -3   # backup file is readable
   ```
5. **Download photos** (must happen before pausing)
   ```bash
   export SRC_URL=https://rmuyoderuasqbdirhvpq.supabase.co
   export SRC_SERVICE_KEY=$(supabase projects api-keys --project-ref rmuyoderuasqbdirhvpq -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(k=>k.name==='service_role').api_key))")
   node scripts/region-move/storage-copy.mjs download "$B/storage"
   ```
   ✅ Checkpoint: four backup files plus `storage/manifest.json` exist. Tested by day: 69 files, 30 MB.

### Swap projects

6. **Pause Seoul** (Dashboard → Project Settings → General → Pause project), then **create the Mumbai project**: name `KSMN Kanakku-book`, region **South Asia (Mumbai)**. The owner sets a new DB password and adds a second line to `pgpass.conf` with the new pooler host and user. Wait for it to show as healthy.
   ```bash
   NEW=<new ref>
   MUMBAI="host=<mumbai pooler host> port=5432 dbname=postgres user=postgres.$NEW sslmode=require"
   ```
7. **Build the schema**
   ```bash
   echo "" | supabase link --project-ref $NEW
   echo y | supabase db push                        # migrations 001-032
   "$PG/pg_dump" "$MUMBAI" --schema-only --schema=public --no-owner --no-privileges -f "$B/mumbai-schema.sql"
   # pg_dump stamps its version and a random \restrict key into each file; drop those lines
   clean() { grep -vF -e '-- Dumped from' -e '\restrict ' -e '\unrestrict ' "$1"; }
   diff <(clean "$B/seoul-schema.sql") <(clean "$B/mumbai-schema.sql")   # expect no differences; stop and investigate if any
   ```
8. **Load the data**
   ```bash
   "$PG/psql" "$MUMBAI" -X -v ON_ERROR_STOP=1 -f scripts/region-move/clear-seed.sql
   "$PG/psql" "$MUMBAI" -X -v ON_ERROR_STOP=1 --single-transaction \
     -c "SET session_replication_role = replica" -f "$B/seoul-data.sql"
   "$PG/psql" "$MUMBAI" -X -v ON_ERROR_STOP=1 -v old_host=rmuyoderuasqbdirhvpq.supabase.co -v new_host=$NEW.supabase.co \
     -f scripts/region-move/rewrite-urls.sql
   ```
9. **Upload photos**
   ```bash
   export DST_URL=https://$NEW.supabase.co
   export DST_SERVICE_KEY=$(supabase projects api-keys --project-ref $NEW -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(k=>k.name==='service_role').api_key))")
   node scripts/region-move/storage-copy.mjs upload "$B/storage"
   node scripts/region-move/storage-copy.mjs verify "$B/storage"
   ```
10. **Prove the copy is exact**
    ```bash
    "$PG/psql" "$MUMBAI" -X -A -t -f scripts/region-move/snapshot.sql > "$B/snapshot-mumbai.txt"
    diff "$B/snapshot-seoul.txt" "$B/snapshot-mumbai.txt"
    ```
    ✅ Only the `files.host ...` lines may differ (Seoul host → Mumbai host, same counts). Any other difference means stop.

### Bring the app back

11. **Secrets and functions**
    ```bash
    supabase secrets set APP_JWT_SECRET="$(grep ^JWT_SECRET= .env | cut -d= -f2- | tr -d '\r')"   # same as before: nobody re-logs in
    # Owner runs this one: supabase secrets set GEMINI_API_KEY=<key> [GEMINI_MODEL=<model>]
    supabase functions deploy --use-api
    ```
12. **Point the website at Mumbai.** In `.env`, set `VITE_SUPABASE_URL=https://$NEW.supabase.co` and `VITE_SUPABASE_ANON_KEY` (anon key from `supabase projects api-keys`). In `firebase.json`, replace `rmuyoderuasqbdirhvpq` with the new ref (CSP). Then `npm run deploy`.
13. **Check** (shop back up):
    - Log in as admin. Customers, balances and the dashboard match yesterday.
    - Open 3 bill photos.
    - Staff login: add a bill and a payment. Admin: approve it.

## Rollback (any step before 13 passes)

1. Pause the Mumbai project.
2. Restore the Seoul project (Dashboard → Restore project; can take a few minutes).
3. Put the original secret back: `supabase secrets set --project-ref rmuyoderuasqbdirhvpq APP_JWT_SECRET="$(grep ^JWT_SECRET= .env | cut -d= -f2- | tr -d '\r')"`
4. `git checkout .env firebase.json` if changed (`.env` is untracked, so restore its two lines by hand), then `npm run deploy`. Or use `npx firebase hosting:rollback` if the app build was never replaced.

Seoul data is exactly as it was at step 4.

## Afterwards

- Keep Seoul paused for 1–2 weeks, then delete it. Free plan: a paused project can be restored for 90 days.
- Commit the `firebase.json` host change and this folder.

## What actually happened (2026-10-12)

Done the same night. Mumbai project ref `vulbnfrmuzrlgccexjbj`, session pooler `aws-0-ap-south-1.pooler.supabase.com`.

- Step 7: `supabase db push` failed on 001 (`uuid_generate_v4` not found): the CLI's temporary login role has no `extensions` schema on its search_path. Instead, every migration file was applied with `psql` as `postgres` (`--single-transaction -v ON_ERROR_STOP=1`, in order), then recorded with `supabase migration repair --status applied 001 … 032`. Later migrations push normally.
- Schema diff: Mumbai differed from Seoul only by leftovers that existed in Seoul and in no migration: the old 001 RLS policies and helper functions that 002 meant to drop, plus a few hand-added functions (one belonging to SiteFlow). None held data and nothing in the code called them; their definitions remain in `seoul-schema.sql`.
- Snapshot diff: identical except the photo-link host line (46 → 46). 71 storage files copied and verified.
