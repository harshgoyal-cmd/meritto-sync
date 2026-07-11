# Meritto → Supabase → Vercel (daily lead sync)

A tiny robot that wakes up every day at 6:00 AM IST, asks Meritto for the last
48 hours of leads, and saves them into Supabase. A dashboard page shows the
results.

## 1. Replace the Supabase table (one-time)

In Supabase → SQL Editor → New query, paste and Run:

```sql
drop table if exists merito_leads;

create table merito_leads (
  lead_id text primary key,
  data jsonb not null,
  synced_at timestamptz default now()
);
```

## 2. Put this folder on GitHub

- Go to github.com → New repository → name it `meritto-sync` → Create.
- Click "uploading an existing file" and drag ALL files in this folder
  (keep the folder structure: `app/`, `lib/`, `package.json`, `vercel.json`).
- Commit.

## 3. Deploy on Vercel

- vercel.com → Add New → Project → Import `meritto-sync`.
- Before clicking Deploy, open "Environment Variables" and add:

| Name | Value |
|---|---|
| MERITTO_SECRET_KEY | your Meritto secret key |
| MERITTO_ACCESS_KEY | your Meritto access key |
| SUPABASE_URL | Supabase → Settings → API → Project URL |
| SUPABASE_SERVICE_ROLE_KEY | Supabase → Settings → API → service_role key |

- Click Deploy.

## 4. Test it

- Open `https://YOUR-APP.vercel.app/api/fields` → should list your real
  Meritto field keys.
- Open `https://YOUR-APP.vercel.app/api/sync` → should say `"ok": true`
  with `leadsSaved`.
- Open `https://YOUR-APP.vercel.app/` → your dashboard.

The cron in `vercel.json` then repeats the sync automatically every day at
00:30 UTC (6:00 AM IST).

## If something looks off

Both `/api/fields` and `/api/sync` return detailed JSON on failure —
copy-paste that JSON back to Claude and it can adjust the code.
